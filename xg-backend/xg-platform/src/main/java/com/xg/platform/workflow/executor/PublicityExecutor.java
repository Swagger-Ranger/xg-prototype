package com.xg.platform.workflow.executor;

import com.xg.common.exception.BizException;
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
import java.util.Map;

/**
 * Publicity-period node. Used for "结果公示 N 天，期间无异议则自动通过；有异议则
 * 进入 interrupt.next 节点" patterns (奖学金、评优、岗位录用 等).
 *
 * <p>DSL shape (inside a node):
 * <pre>
 *   - id: scholarship_publicity
 *     type: publicity
 *     name: 公示 5 天
 *     publicity:
 *       duration: 5d         # required: 5d / 48h / 30m
 *     interrupt_on:
 *       event: appeal_submitted   # only event currently dispatched
 *       next: appeal_review        # node to enter when an appeal arrives mid-publicity
 *     next: granted               # node to enter when publicity ends without interrupt
 * </pre>
 *
 * <p>Behavior:
 * <ul>
 *   <li>On entry: insert one task_instance with assignee_id=NULL (sentinel for
 *       "system task"), status=pending, due_at = now + duration. Returns suspend.</li>
 *   <li>{@code WorkflowDueScheduler} cron picks up tasks where due_at &lt;= NOW()
 *       and calls {@code WorkflowEngine.completePublicity(taskId)} which marks the
 *       task auto_advanced and moves the instance to {@code next}.</li>
 *   <li>If someone calls the appeal endpoint mid-period, the engine marks the
 *       task interrupted and moves the instance to {@code interrupt_on.next}.</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PublicityExecutor implements NodeExecutor {

    private final TaskInstanceMapper taskMapper;

    @Override
    public NodeType getType() {
        return NodeType.PUBLICITY;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        Map<String, Object> publicity = (Map<String, Object>) nodeDef.get("publicity");
        if (publicity == null) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION",
                    "publicity 节点缺少 publicity.duration 配置: " + nodeDef.get("id"));
        }
        String duration = (String) publicity.get("duration");
        OffsetDateTime dueAt = parseDuration(duration);
        if (dueAt == null) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION",
                    "publicity.duration 格式不合法（仅支持 Nh / Nd / Nm）: " + duration);
        }

        TaskInstance task = new TaskInstance();
        task.setWorkflowInstanceId(instance.getId());
        task.setNodeId((String) nodeDef.get("id"));
        task.setNodeName((String) nodeDef.get("name"));
        task.setAssigneeId(null); // system task — driven by due_at, not by an operator
        task.setStatus("pending");
        task.setDueAt(dueAt);
        task.setAssignedAt(OffsetDateTime.now());
        task.setTenantId(instance.getTenantId());
        taskMapper.insert(task);

        log.info("publicity node {} of instance {} suspended until {}",
                nodeDef.get("id"), instance.getId(), dueAt);
        return ExecutionResult.suspend();
    }

    private OffsetDateTime parseDuration(String duration) {
        if (duration == null || duration.isBlank()) return null;
        try {
            if (duration.endsWith("h")) {
                return OffsetDateTime.now().plusHours(Long.parseLong(duration.substring(0, duration.length() - 1)));
            } else if (duration.endsWith("d")) {
                return OffsetDateTime.now().plusDays(Long.parseLong(duration.substring(0, duration.length() - 1)));
            } else if (duration.endsWith("m")) {
                return OffsetDateTime.now().plusMinutes(Long.parseLong(duration.substring(0, duration.length() - 1)));
            }
        } catch (NumberFormatException ignored) {
            return null;
        }
        return null;
    }
}
