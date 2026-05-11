package com.xg.business.student.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.fieldcatalog.service.FieldCatalogService;
import com.xg.business.fieldcatalog.sql.SqlBuilder;
import com.xg.business.student.dto.ClassRosterEntry;
import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.mapper.StudentViewMapper;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudentService {

    private final StudentViewMapper studentViewMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final FieldCatalogService fieldCatalogService;
    private final SqlBuilder sqlBuilder;
    /** 字段目录里 page=student 对应的 yaml,加新筛选项改它就够。 */
    private static final String CATALOG_PAGE = "student";

    public List<ClassRosterEntry> classRoster(Long counselorId) {
        return studentProfileMapper.findRosterByCounselor(counselorId);
    }

    /**
     * 当前用户（必须是学生）的扩展信息 JSONB。非学生 / 没有 student_profile 的
     * 用户拿到空 map，前端据此跳过预填，不会报错。走 MyBatis mapper 而非
     * JdbcTemplate，否则 TenantSchemaInterceptor 不会触发，查不到租户 schema。
     */
    public Map<String, Object> myExtendedInfo(Long userId) {
        if (userId == null) return Map.of();
        String json = studentProfileMapper.findExtendedInfoJsonByUserId(userId);
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(json, Map.class);
            return parsed != null ? parsed : Map.of();
        } catch (JsonProcessingException e) {
            log.warn("extended_info JSONB 反序列化失败 userId={}", userId, e);
            return Map.of();
        }
    }

    public PageResult<StudentView> list(StudentQueryRequest pageQuery, Map<String, String> allParams) {
        // allParams = 原始 query string (含 page/size + 业务 filter)。yaml 字段目录决定哪些 key
        // 算 filter,不在目录里的 key 自动忽略 (page/size 等)。前端 / AI 发的 URL key 必须和 yaml key 一致。
        // 这条路径让"加新 filter"真正只动 yaml 一处:不需要再加 DTO 字段、改 service、改 mapper。
        Map<String, Object> raw = new HashMap<>();
        for (Map.Entry<String, String> e : allParams.entrySet()) {
            String v = e.getValue();
            if (v == null || v.isBlank()) continue;
            raw.put(e.getKey(), v);
        }
        SqlBuilder.Built built = sqlBuilder.build(
                fieldCatalogService.fields(CATALOG_PAGE), raw);
        IPage<StudentView> result = studentViewMapper.selectStudentPage(
                pageQuery.toPage(), built.where(), built.bind());
        return PageResult.of(result);
    }

    public List<String> listClassNames(String college, String major) {
        return studentViewMapper.selectDistinctClassNames(college, major);
    }

    /** 双轨制 filter:列出 org_unit 里 track='residential' 且 type=入参 的所有 name。 */
    public List<String> listResidentialUnitNames(String type) {
        return studentViewMapper.selectResidentialUnitNames(type);
    }

    /** 改书院班 modal 用:扁平列出 [{id, name, academy_name}]。 */
    public List<Map<String, Object>> listResidentialClasses() {
        return studentViewMapper.selectResidentialClassesWithAcademy();
    }

    public StudentView detail(Long id) {
        StudentView student = studentViewMapper.selectStudentById(id);
        if (student == null) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        return student;
    }

    /** Self-service: returns the StudentView keyed off sys_user.id. Returns
     *  null when the caller has no student_profile row (non-student roles). */
    public StudentView selfDetail(Long userId) {
        return studentViewMapper.selectStudentByUserId(userId);
    }

    /**
     * 改学生的"书院班"归属(track='residential' + type='dorm_block' 这一行 membership)。
     * orgUnitId == null → 清空该学生书院班绑定;非 null → 替换为新值。
     *
     * <p>只动书院线那一行,不影响学生的学院班(student_profile.class_id 跟 academic membership
     * 都不动)。一个学生通常只有一个书院班,所以"先删后插"足够,无并发冲突风险。
     */
    @Transactional
    public void setResidentialClass(Long profileId, Long orgUnitId) {
        Long userId;
        try {
            userId = jdbc.queryForObject(
                    "SELECT user_id FROM student_profile WHERE id = ? AND deleted_at IS NULL",
                    Long.class, profileId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        if (userId == null) throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");

        // 校验目标 org_unit 是合法的"书院班"——必须 residential + dorm_block + 未删除。
        // 不校验会让脏数据进 membership(比如把学生绑到学院 class 上),后面 SQL view 拿不出。
        if (orgUnitId != null) {
            Integer ok = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM org_unit WHERE id = ? AND track = 'residential' "
                            + "AND type = 'dorm_block' AND deleted_at IS NULL",
                    Integer.class, orgUnitId);
            if (ok == null || ok == 0) {
                throw new BizException("RESIDENTIAL_CLASS_INVALID",
                        "目标书院班不存在或不可用");
            }
        }

        // 先删后插。删的范围限定在"书院线 + dorm_block",不会误伤学院线 / 书院本体(academy)绑定。
        jdbc.update(
                "DELETE FROM student_org_membership WHERE student_user_id = ? "
                        + "AND org_unit_id IN (SELECT id FROM org_unit "
                        + "WHERE track = 'residential' AND type = 'dorm_block')",
                userId);
        if (orgUnitId != null) {
            jdbc.update(
                    "INSERT INTO student_org_membership (tenant_id, student_user_id, org_unit_id) "
                            + "VALUES (?, ?, ?) "
                            + "ON CONFLICT (student_user_id, org_unit_id) DO NOTHING",
                    TenantContext.getRequiredTenantId(), userId, orgUnitId);
        }
    }

    /**
     * Merge partial extended_info into student_profile.extended_info (JSONB concat).
     * Keys with null value are removed; non-null values are upserted.
     */
    @Transactional
    public void updateExtendedInfo(Long profileId, Map<String, Object> patch) {
        if (patch == null || patch.isEmpty()) return;
        Integer affected = jdbc.queryForObject(
                "SELECT COUNT(1) FROM student_profile WHERE id = ? AND deleted_at IS NULL",
                Integer.class, profileId);
        if (affected == null || affected == 0) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        String patchJson;
        try {
            patchJson = objectMapper.writeValueAsString(patch);
        } catch (JsonProcessingException e) {
            throw new BizException("EXTENDED_INFO_INVALID", "扩展字段序列化失败");
        }
        jdbc.update(
                "UPDATE student_profile SET extended_info = COALESCE(extended_info,'{}'::jsonb) || ?::jsonb, " +
                "updated_at = NOW() WHERE id = ?",
                patchJson, profileId);
    }
}
