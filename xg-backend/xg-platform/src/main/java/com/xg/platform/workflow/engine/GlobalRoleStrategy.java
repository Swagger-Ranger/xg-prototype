package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Generic fallback for {@code scope=global}: resolves the role name against
 * {@code sys_role.code} and returns every active user holding that role
 * tenant-wide. Admins can declare new roles in {@code sys_role} and immediately
 * wire them into YAML with {@code scope: global} — no Java change required.
 *
 * Runs after all specific strategies (higher @Order value) so that e.g.
 * {@code counselor+same_class} still takes its existing path rather than
 * degenerating to "all counselors in the tenant".
 */
@Slf4j
@Component
@Order(1000)
@RequiredArgsConstructor
public class GlobalRoleStrategy implements AssigneeStrategy {

    private final AssigneeLookupMapper lookup;

    @Override
    public boolean supports(String role, String scope) {
        return "global".equals(scope);
    }

    @Override
    public List<Long> resolve(String role, String scope, WorkflowInstance instance) {
        List<Long> users = lookup.findUsersByRoleCode(role);
        if (users.isEmpty()) {
            log.warn("GlobalRoleStrategy: no active users for role={} (role missing from sys_role or unassigned)", role);
        }
        return users;
    }
}
