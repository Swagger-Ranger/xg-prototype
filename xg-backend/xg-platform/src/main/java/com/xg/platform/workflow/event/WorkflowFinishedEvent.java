package com.xg.platform.workflow.event;

import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.Getter;

/**
 * Spring application event published when a workflow instance reaches a terminal
 * state (completed / rejected / cancelled). Business modules subscribe via
 * {@code @EventListener} to keep their own status columns in sync — the engine
 * itself does not know about leave_request / work_study_application / etc.
 */
@Getter
public class WorkflowFinishedEvent {

    private final Long instanceId;
    private final Long initiatorId;
    private final String bizType;
    private final Long bizId;
    /** completed / rejected / cancelled — taken from {@code WorkflowInstance.status}. */
    private final String finalStatus;
    private final String endNodeId;
    private final String tenantId;

    public WorkflowFinishedEvent(WorkflowInstance instance, String endNodeId) {
        this.instanceId = instance.getId();
        this.initiatorId = instance.getInitiatorId();
        this.bizType = instance.getBizType();
        this.bizId = instance.getBizId();
        this.finalStatus = instance.getStatus();
        this.endNodeId = endNodeId;
        this.tenantId = instance.getTenantId();
    }
}
