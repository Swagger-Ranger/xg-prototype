package com.xg.platform.workflow.event;

import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.Getter;

import java.util.List;

/**
 * Fired by ApprovalExecutor right after one or more task_instance rows have
 * been inserted. Business modules subscribe to send "你有一份待审批" notifications
 * via {@link com.xg.platform.notification.service.NotificationOrchestrator},
 * keeping the engine itself decoupled from notification concerns.
 *
 * <p>One event covers all assignees of the same node; the listener fans out to
 * Orchestrator with the recipient list.
 */
@Getter
public class TaskAssignedEvent {

    private final Long instanceId;
    private final String bizType;
    private final Long bizId;
    private final String nodeId;
    private final String nodeName;
    private final List<Long> assigneeIds;
    private final Long initiatorId;
    private final String tenantId;

    public TaskAssignedEvent(WorkflowInstance instance, String nodeId, String nodeName,
                             List<Long> assigneeIds) {
        this.instanceId = instance.getId();
        this.bizType = instance.getBizType();
        this.bizId = instance.getBizId();
        this.nodeId = nodeId;
        this.nodeName = nodeName;
        this.assigneeIds = assigneeIds;
        this.initiatorId = instance.getInitiatorId();
        this.tenantId = instance.getTenantId();
    }
}
