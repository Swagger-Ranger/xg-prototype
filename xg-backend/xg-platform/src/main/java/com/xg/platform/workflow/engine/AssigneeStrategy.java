package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.model.WorkflowInstance;

import java.util.List;

/**
 * Pluggable strategy for resolving the concrete user IDs that should receive
 * an approval task, given a (role, scope) pair from a workflow DSL.
 *
 * Beans are tried in Spring @Order: specific strategies first, generic
 * fallbacks last. First match wins.
 */
public interface AssigneeStrategy {

    boolean supports(String role, String scope);

    /**
     * Resolve assignees for an approval node. The {@link WorkflowInstance} gives
     * the strategy access to bizType/bizId/context so it can look up the
     * canonical owner (e.g. position.owner_user_id) when role/scope alone
     * isn't enough.
     */
    List<Long> resolve(String role, String scope, WorkflowInstance instance);
}
