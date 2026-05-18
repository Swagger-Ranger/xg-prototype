package com.xg.business.dataimport.service;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.business.dataimport.mapper.DataImportWriteMapper;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 学生场景的导入执行器：
 * 1) 按 org_preview.tree 自顶向下创建 to_create 节点（org_unit + org_closure）
 * 2) 建 college/major/class 的 name→id 索引（含既有 + 新建）
 * 3) 逐行写 sys_user + student_profile，按 strategy 处理学号冲突
 *
 * <p>事务策略同 {@link TeacherImportExecutor}:本方法不再 @Transactional 包整批,
 * 改为外层 DataImportService.execute 是 @Transactional + 本类逐行 SAVEPOINT。
 * 防止 PG 单行失败把整事务标记 aborted,导致后续行 + session 状态全写不进去。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudentImportExecutor {

    private final DataImportWriteMapper writeMapper;
    private final SysUserMapper sysUserMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final PlatformTransactionManager txManager;

    /** 缓存 student 角色 id，避免逐行查库。 */
    private Long studentRoleIdCache;

    /** strategy 字符串："skip" | "update"，默认 update。 */
    public Map<String, Object> execute(String tenantId,
                                        Long operatorId,
                                        Map<String, Object> columnMapping,
                                        Map<String, Object> orgPreview,
                                        List<List<String>> rows,
                                        String strategy) {
        final String onConflict = "skip".equalsIgnoreCase(strategy) ? "skip" : "update";
        Map<String, Integer> ti = buildTargetIndex(columnMapping);

        // ── 1) org_unit 创建 ──
        OrgIndex orgs = materializeOrgTree(tenantId, orgPreview);

        // student 角色 id，整批一次性查
        Long studentRoleId = writeMapper.findRoleIdByCode("student");
        if (studentRoleId == null) {
            log.warn("'student' role not found in current tenant; new students will lack role binding");
        }
        studentRoleIdCache = studentRoleId;

        // ── 2) 逐行写学生 ──
        int created = 0, updated = 0, skipped = 0, failed = 0;
        List<Map<String, Object>> failures = new ArrayList<>();

        DefaultTransactionDefinition nested = new DefaultTransactionDefinition();
        nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);

        for (int r = 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            int rowNum = r + 1;
            TransactionStatus sp = txManager.getTransaction(nested);
            try {
                String studentNo = cell(row, ti.get("student_no"));
                String realName = cell(row, ti.get("real_name"));
                String college = cell(row, ti.get("college"));
                String major = cell(row, ti.get("major"));
                String className = cell(row, ti.get("class_name"));
                String phone = cell(row, ti.get("phone"));
                String email = cell(row, ti.get("email"));
                String gender = normalizeGender(cell(row, ti.get("gender")));
                String grade = cell(row, ti.get("grade"));
                String aidLevel = cell(row, ti.get("aid_level"));
                LocalDate enrollDate = parseDate(cell(row, ti.get("enrollment_date")));

                Long classId = orgs.classIdFor(college, major, className);
                if (studentNo.isEmpty() || realName.isEmpty() || classId == null) {
                    txManager.rollback(sp);
                    failed++;
                    failures.add(failure(rowNum,
                            classId == null
                                    ? "班级「" + nullSafe(className) + "」未能解析到组织树节点"
                                    : "学号或姓名为空"));
                    continue;
                }

                Map<String, Object> existing = writeMapper.findStudentByNo(studentNo);
                if (existing != null && !existing.isEmpty()) {
                    if ("skip".equals(onConflict)) {
                        txManager.rollback(sp);
                        skipped++;
                        continue;
                    }
                    Long userId = ((Number) existing.get("user_id")).longValue();
                    Long profileId = ((Number) existing.get("profile_id")).longValue();
                    writeMapper.patchSysUser(userId,
                            nullIfBlank(phone), nullIfBlank(email),
                            nullIfBlank(realName), nullIfBlank(gender), operatorId);
                    writeMapper.patchStudentProfile(profileId,
                            nullIfBlank(grade), nullIfBlank(college), nullIfBlank(major),
                            nullIfBlank(className), classId, operatorId);
                    txManager.commit(sp);
                    updated++;
                } else {
                    SysUser user = new SysUser();
                    user.setUsername(studentNo);
                    user.setRealName(realName);
                    user.setGender(blankToNull(gender));
                    user.setPhone(blankToNull(phone));
                    user.setEmail(blankToNull(email));
                    user.setStatus("active");
                    sysUserMapper.insert(user);

                    StudentProfile profile = new StudentProfile();
                    profile.setUserId(user.getId());
                    profile.setStudentNo(studentNo);
                    profile.setGrade(blankToNull(grade));
                    profile.setCollege(blankToNull(college));
                    profile.setMajor(blankToNull(major));
                    profile.setClassName(blankToNull(className));
                    profile.setClassId(classId);
                    profile.setEnrollmentDate(enrollDate);
                    profile.setStatus("active");
                    profile.setAidLevel(blankToNull(aidLevel));
                    studentProfileMapper.insert(profile);

                    // 给学生绑 'student' 角色，org_id=NULL（全局角色，跟 V038 seed 一致）
                    if (studentRoleIdCache != null) {
                        writeMapper.insertUserRole(user.getId(), studentRoleIdCache, null);
                    }
                    txManager.commit(sp);
                    created++;
                }
            } catch (Exception e) {
                log.warn("student import row {} failed", rowNum, e);
                try { txManager.rollback(sp); } catch (Exception ignore) { /* 释放 savepoint */ }
                failed++;
                failures.add(failure(rowNum, e.getMessage() == null ? "未知错误" : e.getMessage()));
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("created", created);
        summary.put("updated", updated);
        summary.put("skipped", skipped);
        summary.put("failed", failed);
        summary.put("failures", failures);
        return summary;
    }

    // ───────────── org tree materialization ─────────────

    private OrgIndex materializeOrgTree(String tenantId, Map<String, Object> orgPreview) {
        OrgIndex idx = new OrgIndex();
        if (orgPreview == null) return idx;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tree = (List<Map<String, Object>>) orgPreview.get("tree");
        if (tree == null) return idx;
        for (Map<String, Object> c : tree) {
            Long cid = resolveOrCreate(tenantId, c, null);
            idx.collegeByName.put((String) c.get("name"), cid);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> kids = (List<Map<String, Object>>) c.get("children");
            if (kids == null) continue;
            for (Map<String, Object> k : kids) {
                String kType = (String) k.get("type");
                if ("major".equals(kType)) {
                    Long mid = resolveOrCreate(tenantId, k, cid);
                    String mkey = c.get("name") + "/" + k.get("name");
                    idx.majorByCompositeKey.put(mkey, mid);

                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> classes = (List<Map<String, Object>>) k.get("children");
                    if (classes == null) continue;
                    for (Map<String, Object> cl : classes) {
                        Long clId = resolveOrCreate(tenantId, cl, mid);
                        idx.classByCompositeKey.put(c.get("name") + "/" + k.get("name") + "/" + cl.get("name"), clId);
                    }
                } else if ("class".equals(kType)) {
                    // class 直接挂 college 下（major 列没映射的情况）
                    Long clId = resolveOrCreate(tenantId, k, cid);
                    idx.classByCompositeKey.put(c.get("name") + "//" + k.get("name"), clId);
                }
            }
            // increment 计数：created 节点都 +1
        }
        return idx;
    }

    private Long resolveOrCreate(String tenantId, Map<String, Object> node, Long parentId) {
        String status = (String) node.get("status");
        if ("existing".equals(status)) {
            Object id = node.get("id");
            return id == null ? null : ((Number) id).longValue();
        }
        // to_create
        long id = IdWorker.getId();
        writeMapper.insertOrgUnit(id, tenantId, parentId, (String) node.get("name"),
                null, (String) node.get("type"));
        if (parentId == null) {
            writeMapper.insertOrgClosureSelf(id);
        } else {
            writeMapper.insertOrgClosure(id, parentId);
        }
        return id;
    }

    private static class OrgIndex {
        final Map<String, Long> collegeByName = new HashMap<>();
        final Map<String, Long> majorByCompositeKey = new HashMap<>();
        final Map<String, Long> classByCompositeKey = new HashMap<>();

        Long classIdFor(String college, String major, String className) {
            if (college == null || college.isBlank() || className == null || className.isBlank()) return null;
            if (major != null && !major.isBlank()) {
                Long v = classByCompositeKey.get(college + "/" + major + "/" + className);
                if (v != null) return v;
            }
            return classByCompositeKey.get(college + "//" + className);
        }
    }

    // ───────────── small utils ─────────────

    private static Map<String, Integer> buildTargetIndex(Map<String, Object> columnMapping) {
        Map<String, Integer> out = new HashMap<>();
        if (columnMapping == null) return out;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mappings = (List<Map<String, Object>>) columnMapping.get("mappings");
        if (mappings == null) return out;
        for (Map<String, Object> m : mappings) {
            Object t = m.get("target");
            if (t == null) continue;
            Object idx = m.get("source_index");
            if (idx instanceof Number n) out.put((String) t, n.intValue());
        }
        return out;
    }

    private static String cell(List<String> row, Integer idx) {
        if (idx == null || row == null || idx < 0 || idx >= row.size()) return "";
        String v = row.get(idx);
        return v == null ? "" : v.trim();
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static String nullIfBlank(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    private static String normalizeGender(String s) {
        if (s == null) return "";
        return switch (s.trim().toLowerCase()) {
            case "男", "male", "m" -> "male";
            case "女", "female", "f" -> "female";
            case "" -> "";
            default -> "unknown";
        };
    }

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ISO_LOCAL_DATE,                  // 2025-09-01
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("yyyy.MM.dd"),
            DateTimeFormatter.ofPattern("yyyy年M月d日")
    };

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        for (DateTimeFormatter f : DATE_FORMATS) {
            try { return LocalDate.parse(s, f); } catch (DateTimeParseException ignore) {}
        }
        return null;
    }

    private static Map<String, Object> failure(int rowNum, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("row", rowNum);
        m.put("message", message);
        return m;
    }

    /** Convenience for tests / external callers that want the current tenant pulled from context. */
    public Map<String, Object> executeForCurrentTenant(Long operatorId,
                                                       Map<String, Object> columnMapping,
                                                       Map<String, Object> orgPreview,
                                                       List<List<String>> rows,
                                                       String strategy) {
        return execute(TenantContext.getRequiredTenantId(), operatorId, columnMapping, orgPreview, rows, strategy);
    }
}
