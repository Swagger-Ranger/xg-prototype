package com.xg.platform.workflow.engine;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.mapper.FormDataMapper;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.FormData;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class WorkflowEngine {

    private final Map<NodeType, NodeExecutor> executors;
    private final WorkflowInstanceMapper instanceMapper;
    private final WorkflowDefinitionMapper definitionMapper;
    private final FormDataMapper formDataMapper;
    private final TaskInstanceMapper taskInstanceMapper;

    public WorkflowEngine(List<NodeExecutor> executorList,
                          WorkflowInstanceMapper instanceMapper,
                          WorkflowDefinitionMapper definitionMapper,
                          FormDataMapper formDataMapper,
                          TaskInstanceMapper taskInstanceMapper) {
        this.instanceMapper = instanceMapper;
        this.definitionMapper = definitionMapper;
        this.formDataMapper = formDataMapper;
        this.taskInstanceMapper = taskInstanceMapper;
        this.executors = new HashMap<>();
        for (NodeExecutor executor : executorList) {
            executors.put(executor.getType(), executor);
        }
    }

    /**
     * Start a new workflow instance.
     * 1. Find the latest published definition for the given code
     * 2. Snapshot config_json into definitionSnapshot
     * 3. Create WorkflowInstance (status=running, currentNodeId=first node)
     * 4. Persist form data
     * 5. Execute the first node
     */
    @Transactional
    public WorkflowInstance startWorkflow(String definitionCode, Long initiatorId,
                                          String bizType, Long bizId,
                                          Map<String, Object> formData,
                                          Map<String, Object> aiDraft) {
        WorkflowDefinition definition = definitionMapper.selectOne(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getCode, definitionCode)
                        .eq(WorkflowDefinition::getStatus, "published")
                        .orderByDesc(WorkflowDefinition::getVersion)
                        .last("LIMIT 1")
        );
        if (definition == null) {
            throw new BizException("WORKFLOW_DEFINITION_NOT_FOUND",
                    "找不到已发布的工作流定义: " + definitionCode);
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> snapshot = (Map<String, Object>) definition.getConfigJson();

        WorkflowInstance instance = new WorkflowInstance();
        instance.setDefinitionId(definition.getId());
        instance.setDefinitionSnapshot(snapshot);
        instance.setInitiatorId(initiatorId);
        instance.setStatus("running");
        instance.setBizType(bizType);
        instance.setBizId(bizId);
        instance.setStartedAt(OffsetDateTime.now());
        instance.setContext(formData != null ? new HashMap<>(formData) : new HashMap<>());
        instance.setTenantId(definition.getTenantId());

        String firstNodeId = getFirstNodeId(snapshot);
        instance.setCurrentNodeId(firstNodeId);

        instanceMapper.insert(instance);

        // Persist form data
        if (formData != null || aiDraft != null) {
            FormData fd = new FormData();
            fd.setWorkflowInstanceId(instance.getId());
            fd.setData(formData);
            fd.setAiDraft(aiDraft);
            fd.setTenantId(definition.getTenantId());
            formDataMapper.insert(fd);
        }

        executeNode(instance, firstNodeId, 0);
        return instance;
    }

    /**
     * Execute a node and auto-advance through non-suspending nodes.
     */
    private void executeNode(WorkflowInstance instance, String nodeId, int depth) {
        if (depth > 100) {
            throw new BizException("WORKFLOW_DEPTH_EXCEEDED", "工作流执行深度超过限制，可能存在循环");
        }
        Map<String, Object> nodeDef = findNodeInSnapshot(instance.getDefinitionSnapshot(), nodeId);
        String typeStr = (String) nodeDef.get("type");
        NodeType nodeType = NodeType.valueOf(typeStr.toUpperCase());

        NodeExecutor executor = executors.get(nodeType);
        if (executor == null) {
            throw new BizException("WORKFLOW_INVALID_NODE_TYPE", "无效的节点类型: " + typeStr);
        }

        ExecutionResult result = executor.execute(instance, nodeDef);

        if (result.isSuspended()) {
            instance.setCurrentNodeId(nodeId);
            instanceMapper.updateById(instance);
            return;
        }

        if (result.getNextNodeId() == null) {
            // Terminal - end node already updated status in EndExecutor
            return;
        }

        instance.setCurrentNodeId(result.getNextNodeId());
        instanceMapper.updateById(instance);
        executeNode(instance, result.getNextNodeId(), depth + 1);
    }

    /**
     * Handle approval decision (approve or reject).
     */
    @Transactional
    public void handleApproval(Long taskId, String action, String comment, Long operatorId) {
        TaskInstance task = taskInstanceMapper.selectById(taskId);
        if (task == null) {
            throw new BizException("TASK_NOT_FOUND", "任务不存在: " + taskId);
        }
        if (!operatorId.equals(task.getAssigneeId())) {
            throw new BizException("TASK_FORBIDDEN", "无权操作该任务");
        }
        if (!"pending".equals(task.getStatus())) {
            throw new BizException("TASK_ALREADY_HANDLED", "任务已处理");
        }

        OffsetDateTime now = OffsetDateTime.now();
        long durationMs = task.getAssignedAt() != null
                ? java.time.Duration.between(task.getAssignedAt(), now).toMillis()
                : 0;

        task.setStatus("approve".equals(action) ? "approved" : "rejected");
        task.setComment(comment);
        task.setCompletedAt(now);
        task.setDecisionDurationMs(durationMs);
        taskInstanceMapper.updateById(task);

        WorkflowInstance instance = instanceMapper.selectById(task.getWorkflowInstanceId());
        if (instance == null || !"running".equals(instance.getStatus())) {
            return;
        }

        Map<String, Object> nodeDef = findNodeInSnapshot(instance.getDefinitionSnapshot(), task.getNodeId());

        String nextNodeId;
        if ("approve".equals(action)) {
            nextNodeId = (String) nodeDef.get("next");
        } else {
            nextNodeId = (String) nodeDef.getOrDefault("rejected_next", null);
            if (nextNodeId == null) {
                // No explicit rejection target - find or create an END node
                nextNodeId = findEndNodeId(instance.getDefinitionSnapshot());
            }
        }

        if (nextNodeId != null) {
            instance.setCurrentNodeId(nextNodeId);
            instanceMapper.updateById(instance);
            executeNode(instance, nextNodeId, 0);
        } else {
            instance.setStatus("rejected");
            instance.setFinishedAt(now);
            instanceMapper.updateById(instance);
        }
    }

    /**
     * Batch approve multiple tasks. Each task runs in its own transaction.
     * Max 50 tasks per batch.
     */
    public BatchApproveResult batchApprove(List<Long> taskIds, String action, String comment, Long operatorId) {
        if (taskIds == null || taskIds.isEmpty()) {
            throw new BizException("BAD_REQUEST", "任务列表不能为空");
        }
        if (taskIds.size() > 50) {
            throw new BizException("BAD_REQUEST", "批量审批最多50条");
        }

        BatchApproveResult result = new BatchApproveResult();
        for (Long taskId : taskIds) {
            try {
                handleApprovalNewTransaction(taskId, action, comment, operatorId);
                result.addSuccess();
            } catch (Exception e) {
                log.warn("Batch approve failed for taskId={}: {}", taskId, e.getMessage());
                result.addFailure(taskId, e.getMessage());
            }
        }
        return result;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleApprovalNewTransaction(Long taskId, String action, String comment, Long operatorId) {
        handleApproval(taskId, action, comment, operatorId);
    }

    /**
     * Withdraw a workflow instance.
     * Only allowed if status=running and the first approval node task is still pending.
     */
    @Transactional
    public void withdraw(Long instanceId, Long operatorId) {
        WorkflowInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null) {
            throw new BizException("WORKFLOW_NOT_FOUND", "工作流实例不存在: " + instanceId);
        }
        if (!operatorId.equals(instance.getInitiatorId())) {
            throw new BizException("WORKFLOW_FORBIDDEN", "只有发起人可以撤回");
        }
        if (!"running".equals(instance.getStatus())) {
            throw new BizException("WORKFLOW_CANNOT_WITHDRAW", "工作流不在运行中，无法撤回");
        }

        // Check that current pending task has not been acted on yet
        long handledCount = taskInstanceMapper.selectCount(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .in(TaskInstance::getStatus, List.of("approved", "rejected"))
        );
        if (handledCount > 0) {
            throw new BizException("WORKFLOW_CANNOT_WITHDRAW", "已有审批人操作，无法撤回");
        }

        // Cancel pending tasks
        TaskInstance cancelUpdate = new TaskInstance();
        cancelUpdate.setStatus("skipped");
        taskInstanceMapper.update(cancelUpdate,
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .eq(TaskInstance::getStatus, "pending")
        );

        instance.setStatus("cancelled");
        instance.setFinishedAt(OffsetDateTime.now());
        instanceMapper.updateById(instance);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findNodeInSnapshot(Map<String, Object> snapshot, String nodeId) {
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) snapshot.get("nodes");
        if (nodes == null) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION", "工作流定义缺少 nodes 字段");
        }
        return nodes.stream()
                .filter(n -> nodeId.equals(n.get("id")))
                .findFirst()
                .orElseThrow(() -> new BizException("WORKFLOW_NODE_NOT_FOUND", "找不到节点: " + nodeId));
    }

    @SuppressWarnings("unchecked")
    private String getFirstNodeId(Map<String, Object> snapshot) {
        String startNode = (String) snapshot.get("start");
        if (startNode != null) return startNode;

        List<Map<String, Object>> nodes = (List<Map<String, Object>>) snapshot.get("nodes");
        if (nodes == null || nodes.isEmpty()) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION", "工作流定义没有节点");
        }
        return (String) nodes.get(0).get("id");
    }

    @SuppressWarnings("unchecked")
    private String findEndNodeId(Map<String, Object> snapshot) {
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) snapshot.get("nodes");
        if (nodes == null) return null;
        return nodes.stream()
                .filter(n -> "END".equalsIgnoreCase((String) n.get("type")))
                .map(n -> (String) n.get("id"))
                .findFirst()
                .orElse(null);
    }
}
