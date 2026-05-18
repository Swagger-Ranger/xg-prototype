package com.xg.business.dataimport.service;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.business.dataimport.mapper.DataImportWriteMapper;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.system.service.SystemUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 教师场景执行器 (方案 B)：
 * <ul>
 *   <li>写 sys_user（基础信息）</li>
 *   <li>查 / 自动建 org_unit（"所在单位"列；命中现有学院则复用，否则当机关部门建）</li>
 *   <li>写 sys_user_role(role='teacher', org_id=&lt;resolved 单位&gt;)；
 *       PK 撞了走 DO UPDATE 改 org_id（教师调岗的情况）</li>
 * </ul>
 *
 * <p><b>事务策略</b>:本方法不再用 @Transactional 包整批,
 * 改成"外层 DataImportService.execute 是 @Transactional + 本类逐行 SAVEPOINT"。
 * 原因:PostgreSQL 在单事务里任意语句失败 → 整事务标记 aborted,后续 SQL 全报
 * "current transaction is aborted",连最后写 session 状态都会失败,导致
 * "summary 里说 N 个失败,session 状态也写不进去"的灾难性失真。
 * 每行 PROPAGATION_NESTED 起一个 savepoint:行失败仅回滚本行,外层 txn 继续。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TeacherImportExecutor {

    private final DataImportWriteMapper writeMapper;
    private final SysUserMapper sysUserMapper;
    private final PlatformTransactionManager txManager;

    public Map<String, Object> execute(String tenantId,
                                        Long operatorId,
                                        Map<String, Object> columnMapping,
                                        List<List<String>> rows,
                                        String strategy) {
        final String onConflict = "skip".equalsIgnoreCase(strategy) ? "skip" : "update";
        Map<String, Integer> ti = buildTargetIndex(columnMapping);

        Long teacherRoleId = writeMapper.findRoleIdByCode("teacher");
        if (teacherRoleId == null) {
            throw new BizException("IMPORT_ROLE_NOT_FOUND",
                    "系统未配置 'teacher' 角色 (sys_role.code='teacher')，请先在角色管理建好");
        }

        // 默认密码 hash 一次复用:BCrypt cost=10 单次 ~100ms,2000 行 loop 内重算会跑 200+s
        // 占连接 / 触发 txn 超时;且导入兜底密码无差异化必要,统一 hash 反而更利于 rotate。
        final String defaultPwdHash = BCrypt.hashpw(SystemUserService.DEFAULT_PASSWORD);

        // 边导边攒 org name → id 索引（同 Excel 内多行同单位只查一次库 / 建一次）
        Map<String, Long> orgIdByName = new HashMap<>();

        int created = 0, updated = 0, skipped = 0, failed = 0, orgsCreated = 0;
        List<Map<String, Object>> failures = new ArrayList<>();
        List<String> createdOrgNames = new ArrayList<>();

        DefaultTransactionDefinition nested = new DefaultTransactionDefinition();
        nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);

        for (int r = 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            int rowNum = r + 1;
            TransactionStatus sp = txManager.getTransaction(nested);
            try {
                String username = cell(row, ti.get("username"));
                String realName = cell(row, ti.get("real_name"));
                String gender = normalizeGender(cell(row, ti.get("gender")));
                String phone = cell(row, ti.get("phone"));
                String email = cell(row, ti.get("email"));
                String orgName = cell(row, ti.get("org_name"));

                if (username.isEmpty() || realName.isEmpty()) {
                    txManager.rollback(sp);
                    failed++;
                    failures.add(failure(rowNum, "工号或姓名为空"));
                    continue;
                }

                // 1) 解析"所在单位" → org_id (可能为 null)
                Long orgId = null;
                if (!orgName.isEmpty()) {
                    Long cached = orgIdByName.get(orgName);
                    if (cached != null) {
                        orgId = cached;
                    } else {
                        Long existing = writeMapper.findOrgIdByName(orgName);
                        if (existing != null) {
                            orgId = existing;
                        } else {
                            // 没有 → 新建机关部门
                            long newId = IdWorker.getId();
                            writeMapper.insertOrgUnit(newId, tenantId, null, orgName, null, "admin_dept");
                            writeMapper.insertOrgClosureSelf(newId);
                            orgId = newId;
                            orgsCreated++;
                            createdOrgNames.add(orgName);
                        }
                        orgIdByName.put(orgName, orgId);
                    }
                }

                // 2) 找现有 user
                Long existingUserId = writeMapper.findUserIdByUsername(username);
                if (existingUserId != null) {
                    if ("skip".equals(onConflict)) {
                        // skip 不算异常,本行不写,但 savepoint 已开,需要 rollback 释放
                        txManager.rollback(sp);
                        skipped++;
                        continue;
                    }
                    writeMapper.patchSysUser(existingUserId,
                            nullIfBlank(phone), nullIfBlank(email),
                            nullIfBlank(realName), nullIfBlank(gender), operatorId);
                    // teacher 角色：可能是补绑 (之前没绑), 也可能是改 org_id (调岗)
                    writeMapper.insertUserRole(existingUserId, teacherRoleId, orgId);
                    txManager.commit(sp);
                    updated++;
                } else {
                    SysUser user = new SysUser();
                    user.setUsername(username);
                    user.setRealName(realName);
                    user.setGender(blankToNull(gender));
                    user.setPhone(blankToNull(phone));
                    user.setEmail(blankToNull(email));
                    user.setStatus("active");
                    // 批量导入默认走 DEFAULT_PASSWORD,否则导进来的教师 password_hash=NULL
                    // 直接无法登录(后续接 SSO 时这里改成走 SSO 标记,无密码)。
                    user.setPasswordHash(defaultPwdHash);
                    sysUserMapper.insert(user);

                    writeMapper.insertUserRole(user.getId(), teacherRoleId, orgId);
                    txManager.commit(sp);
                    created++;
                }
            } catch (Exception e) {
                log.warn("teacher import row {} failed", rowNum, e);
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
        summary.put("orgs_created", orgsCreated);
        summary.put("orgs_created_names", createdOrgNames);
        summary.put("failures", failures);
        return summary;
    }

    // ───────────── helpers ─────────────

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

    private static String normalizeGender(String s) {
        if (s == null) return "";
        return switch (s.trim().toLowerCase()) {
            case "男", "male", "m" -> "male";
            case "女", "female", "f" -> "female";
            case "" -> "";
            default -> "unknown";
        };
    }

    private static Map<String, Object> failure(int rowNum, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("row", rowNum);
        m.put("message", message);
        return m;
    }
}
