package com.xg.business.student.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.student.dto.ClassRosterEntry;
import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.mapper.StudentViewMapper;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public PageResult<StudentView> list(StudentQueryRequest query) {
        Page<StudentView> page = query.toPage();
        IPage<StudentView> result = studentViewMapper.selectStudentPage(
                page, query.getKeyword(), query.getGrade(), query.getStatus(),
                query.getCollege(), query.getMajor(), query.getClassName());
        return PageResult.of(result);
    }

    public List<String> listClassNames(String college, String major) {
        return studentViewMapper.selectDistinctClassNames(college, major);
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
