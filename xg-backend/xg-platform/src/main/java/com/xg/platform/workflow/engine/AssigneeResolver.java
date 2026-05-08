package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resolves a (role, scope) pair from the workflow DSL into concrete user IDs.
 * Delegation order follows Spring's @Order: specific strategies first, generic
 * fallbacks last — first supporting strategy wins.
 */
@Slf4j
@Component
public class AssigneeResolver {

    private final List<AssigneeStrategy> strategies;

    public AssigneeResolver(List<AssigneeStrategy> strategies) {
        this.strategies = strategies;
    }

    public List<Long> resolve(String role, String scope, WorkflowInstance instance) {
        if (instance == null || role == null) {
            return List.of();
        }
        for (AssigneeStrategy strategy : strategies) {
            if (strategy.supports(role, scope)) {
                return strategy.resolve(role, scope, instance);
            }
        }
        log.warn("AssigneeResolver: no strategy matched role={} scope={} — task will have no assignee", role, scope);
        return List.of();
    }
}
