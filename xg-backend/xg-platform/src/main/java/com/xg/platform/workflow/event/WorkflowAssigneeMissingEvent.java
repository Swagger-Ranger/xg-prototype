package com.xg.platform.workflow.event;

import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.Getter;

/**
 * 审批节点解析不到任何受理人时由 ApprovalExecutor 发布。
 *
 * <p>灰度第一步(RBAC 落地方案 §5.5):流程仍 suspend(不 fail-fast),但把
 * "静默挂住" 升级成一个带完整上下文的事件,让监听方告警 / 让运维能定位。
 * Sprint 2 在确认存量定义无误后,改成 fail-fast(WORKFLOW_ASSIGNEE_NOT_FOUND)。
 *
 * <p>与 {@link TaskAssignedEvent} 同包同风格,保持引擎与告警解耦。
 */
@Getter
public class WorkflowAssigneeMissingEvent {

    private final Long instanceId;
    private final String bizType;
    private final Long bizId;
    private final String nodeId;
    private final String nodeName;
    private final String role;
    private final String scope;
    private final Long initiatorId;
    private final String tenantId;

    public WorkflowAssigneeMissingEvent(WorkflowInstance instance, String nodeId, String nodeName,
                                        String role, String scope) {
        this.instanceId = instance.getId();
        this.bizType = instance.getBizType();
        this.bizId = instance.getBizId();
        this.nodeId = nodeId;
        this.nodeName = nodeName;
        this.role = role;
        this.scope = scope;
        this.initiatorId = instance.getInitiatorId();
        this.tenantId = instance.getTenantId();
    }
}
