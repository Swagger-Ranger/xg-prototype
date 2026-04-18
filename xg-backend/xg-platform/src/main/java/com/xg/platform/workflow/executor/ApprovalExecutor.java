package com.xg.platform.workflow.executor;

import com.xg.platform.workflow.engine.AssigneeResolver;
import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @Override
    public NodeType getType() {
        return NodeType.APPROVAL;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        String role = getNestedString(nodeDef, "assignee", "role");
        String scope = getNestedString(nodeDef, "assignee", "scope");
        List<Long> assigneeIds = assigneeResolver.resolve(role, scope, instance.getInitiatorId());

        String nodeId = (String) nodeDef.get("id");
        String nodeName = (String) nodeDef.get("name");

        if (assigneeIds.isEmpty()) {
            log.warn("No assignees found for node {} in workflow instance {}", nodeId, instance.getId());
            // TODO: send notification to school_admin about missing assignee
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
