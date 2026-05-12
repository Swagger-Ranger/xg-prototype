package com.xg.business.observer.service;

import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.queryguard.ExecContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * 把当前登录用户 + role 翻译成 QueryGuard 的 ExecContext。
 *
 * <p>逻辑:
 * <ul>
 *   <li>userId = CurrentUser.id()</li>
 *   <li>role = sys_user_role join sys_role 拿到的角色 code(取优先级最高的一个)</li>
 *   <li>dean → 从 sys_user_role.org_id 关联 org_unit (type=college) 拿 college name</li>
 *   <li>counselor → counselor_org_mapping.org_id 列表(任教班级 IDs)</li>
 *   <li>class_master → org_unit.leader_id 反查任教班级 IDs(单班)</li>
 *   <li>其它角色 → scope 留空,SQL 不做列级过滤(全校口径)</li>
 * </ul>
 *
 * <p>SQL 不指定 schema —— 走 TenantSchemaInterceptor 自动 search_path。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ObserverContextResolver {

    private static final List<String> ROLE_PRIORITY = List.of(
            "super_admin", "school_admin", "student_affairs_director",
            "dean", "counselor", "class_master", "student");

    private final JdbcTemplate jdbc;

    public ExecContext resolve() {
        return resolve(false);
    }

    public ExecContext resolve(boolean bypassCache) {
        Long userId = CurrentUser.id();
        String role = pickPrimaryRole(userId);
        if (role == null) {
            throw new BizException("OBSERVER_ROLE_MISSING",
                    "当前用户未绑定任何角色,无法使用 AI 观察员");
        }

        String college = null;
        List<Long> classes = null;
        try {
            if ("dean".equals(role)) {
                college = jdbc.query(
                        "SELECT o.name FROM org_unit o " +
                                "JOIN sys_user_role ur ON ur.org_id = o.id " +
                                "JOIN sys_role r ON r.id = ur.role_id " +
                                "WHERE ur.user_id = ? AND r.code = 'dean' " +
                                "AND o.type = 'college' AND o.deleted_at IS NULL " +
                                "LIMIT 1",
                        rs -> rs.next() ? rs.getString(1) : null, userId);
            } else if ("counselor".equals(role)) {
                classes = jdbc.queryForList(
                        "SELECT org_id FROM counselor_org_mapping WHERE user_id = ?",
                        Long.class, userId);
            } else if ("class_master".equals(role)) {
                classes = jdbc.queryForList(
                        "SELECT id FROM org_unit WHERE leader_id = ? " +
                                "AND type = 'class' AND deleted_at IS NULL",
                        Long.class, userId);
            }
        } catch (Exception e) {
            log.warn("ObserverContextResolver lookup failed for user={} role={}: {}",
                    userId, role, e.getMessage());
        }

        return ExecContext.builder()
                .tenantId(TenantContext.getTenantId())
                .ownerId(userId)
                .ownerRole(role)
                .ownerCollege(college)
                .counselorClasses(classes == null ? Collections.emptyList() : classes)
                .bypassCache(bypassCache)
                .build();
    }

    private String pickPrimaryRole(Long userId) {
        List<String> roles = jdbc.queryForList(
                "SELECT r.code FROM sys_user_role ur " +
                        "JOIN sys_role r ON r.id = ur.role_id " +
                        "WHERE ur.user_id = ? AND r.deleted_at IS NULL",
                String.class, userId);
        for (String prio : ROLE_PRIORITY) {
            if (roles.contains(prio)) return prio;
        }
        return roles.isEmpty() ? null : roles.get(0);
    }
}
