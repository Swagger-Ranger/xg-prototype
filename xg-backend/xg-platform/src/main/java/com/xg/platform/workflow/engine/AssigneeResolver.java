package com.xg.platform.workflow.engine;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class AssigneeResolver {

    /**
     * Resolve assignee user IDs based on role and scope.
     *
     * @param role        e.g., "counselor", "dean", "school_admin"
     * @param scope       e.g., "same_class", "same_department", null
     * @param initiatorId the user who started the workflow
     * @return list of user IDs who should receive the approval task
     */
    public List<Long> resolve(String role, String scope, Long initiatorId) {
        // Stub implementation - will be completed when RBAC module is ready.
        // Real implementation needs:
        // 1. Look up initiator's org_id
        // 2. Based on scope, find the target org level (class -> college)
        // 3. Query users with the specified role in that org
        // For "counselor" + "same_class": query counselor_org_mapping
        // For "dean" + "same_department": find college-level org, query users with dean role
        // For "school_admin" (no scope): query all school_admin users in tenant
        log.debug("AssigneeResolver.resolve called: role={}, scope={}, initiatorId={}", role, scope, initiatorId);
        return List.of();
    }
}
