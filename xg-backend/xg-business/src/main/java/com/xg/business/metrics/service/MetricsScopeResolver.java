package com.xg.business.metrics.service;

import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.xg.business.metrics.dto.MetricScope;
import com.xg.business.metrics.mapper.MetricsScopeMapper;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 把当前登录用户翻成 MetricScope。逻辑:
 *  - super_admin / school_admin / student_affairs_director → WHOLE_SCHOOL
 *  - dean → DEAN_OF_COLLEGE,collegeId 来自 sys_user_role(role_id=4) → org_unit
 *  - 其他角色 → DENIED(controller 据此 403)
 *
 * <p>角色 code 从 Sa-Token 的 StpInterface.getRoleList 取 — 跟权限系统单一来源,
 * 不在这里建第 2 份角色快照。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MetricsScopeResolver {

    private final MetricsScopeMapper scopeMapper;
    private final StpInterface stpInterface;

    public MetricScope resolveCurrent() {
        Long userId = CurrentUser.id();
        if (userId == null) return MetricScope.denied();
        List<String> roles = stpInterface.getRoleList(userId, StpUtil.getLoginType());
        if (roles == null) return MetricScope.denied();

        // 全校视角:任一管理类角色都给全量
        if (roles.contains("super_admin")
                || roles.contains("school_admin")
                || roles.contains("student_affairs_director")) {
            return MetricScope.wholeSchool();
        }
        if (roles.contains("dean")) {
            Map<String, Object> row = scopeMapper.findManagedCollege(userId);
            if (row == null || row.get("id") == null) {
                log.warn("dean user {} has no managed college binding, denied", userId);
                return MetricScope.denied();
            }
            return MetricScope.deanOf(
                    ((Number) row.get("id")).longValue(),
                    (String) row.get("name"));
        }
        return MetricScope.denied();
    }
}
