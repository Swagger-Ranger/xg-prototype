package com.xg.platform.workflow.executor;

import com.xg.common.exception.BizException;
import com.xg.platform.workflow.engine.AssigneeResolver;
import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.event.TaskAssignedEvent;
import com.xg.platform.workflow.event.WorkflowAssigneeMissingEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ApprovalExecutor implements NodeExecutor {

    private final TaskInstanceMapper taskMapper;
    private final AssigneeResolver assigneeResolver;
    private final ApplicationEventPublisher eventPublisher;

    /** 灰度第二步(RBAC 落地方案 §5.9.4 step5 / §11):false=保持 S1-4 告警+suspend
     *  (默认,确认存量定义无异常前);true=空 assignee 直接抛错让发起业务事务回滚。 */
    @Value("${xg.rbac.workflow.empty-assignee-fail-fast:false}")
    private boolean emptyAssigneeFailFast;

    @Override
    public NodeType getType() {
        return NodeType.APPROVAL;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        String role = getNestedString(nodeDef, "assignee", "role");
        String scope = getNestedString(nodeDef, "assignee", "scope");
        List<Long> assigneeIds = assigneeResolver.resolve(role, scope, instance);

        String nodeId = (String) nodeDef.get("id");
        String nodeName = (String) nodeDef.get("name");

        if (assigneeIds.isEmpty()) {
            log.warn("No assignees found for node {} in workflow instance {}", nodeId, instance.getId());
            // 灰度第一步:不 fail-fast,但把"静默挂住"升级成事件,让监听方告警/运维可定位
            // (RBAC 落地方案 §5.5)。Sprint 2 确认存量无误后改抛 WORKFLOW_ASSIGNEE_NOT_FOUND。
            try {
                eventPublisher.publishEvent(
                        new WorkflowAssigneeMissingEvent(instance, nodeId, nodeName, role, scope));
            } catch (Exception e) {
                log.warn("publish WorkflowAssigneeMissingEvent failed for instance {} node {}: {}",
                        instance.getId(), nodeId, e.getMessage());
            }
            if (emptyAssigneeFailFast) {
                // 灰度第二步:不再静默 suspend,抛错让发起业务事务回滚,杜绝"无任务 running 实例"
                throw new BizException("WORKFLOW_ASSIGNEE_NOT_FOUND",
                        "审批节点未解析到受理人：" + role + "/" + scope);
            }
        }

        OffsetDateTime dueAt = null;
        Map<String, Object> timeout = (Map<String, Object>) nodeDef.get("timeout");
        if (timeout != null) {
            String duration = (String) timeout.get("duration");
            dueAt = calculateDueAt(duration);
        }

        for (Long assigneeId : assigneeIds) {
            TaskInstance task = new TaskInstance();
            task.setWorkflowInstanceId(instance.getId());
            task.setNodeId(nodeId);
            task.setNodeName(nodeName);
            task.setAssigneeId(assigneeId);
            task.setStatus("pending");
            task.setDueAt(dueAt);
            task.setAssignedAt(OffsetDateTime.now());
            task.setTenantId(instance.getTenantId());
            taskMapper.insert(task);
        }

        // Fire one event per node (not per assignee) so the listener can fan out
        // a single Orchestrator call with the full recipient list.
        if (!assigneeIds.isEmpty()) {
            try {
                eventPublisher.publishEvent(new TaskAssignedEvent(instance, nodeId, nodeName, assigneeIds));
            } catch (Exception e) {
                log.warn("publish TaskAssignedEvent failed for instance {} node {}: {}",
                        instance.getId(), nodeId, e.getMessage());
            }
        }

        return ExecutionResult.suspend();
    }

    @SuppressWarnings("unchecked")
    private String getNestedString(Map<String, Object> map, String key1, String key2) {
        Object nested = map.get(key1);
        if (nested instanceof Map) {
            return (String) ((Map<String, Object>) nested).get(key2);
        }
        return null;
    }

    private OffsetDateTime calculateDueAt(String duration) {
        if (duration == null) return null;
        if (duration.endsWith("h")) {
            return OffsetDateTime.now().plusHours(Long.parseLong(duration.replace("h", "")));
        } else if (duration.endsWith("d")) {
            return OffsetDateTime.now().plusDays(Long.parseLong(duration.replace("d", "")));
        } else if (duration.endsWith("m")) {
            return OffsetDateTime.now().plusMinutes(Long.parseLong(duration.replace("m", "")));
        }
        return null;
    }
}
