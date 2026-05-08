package com.xg.platform.workflow.engine;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.exception.BizException;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import com.xg.platform.workflow.mapper.FormDataMapper;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.form.FormSchema;
import com.xg.platform.workflow.model.FormData;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final AssigneeLookupMapper assigneeLookupMapper;

    @Autowired(required = false)
    private StudentEventPublisher studentEventPublisher;

    public WorkflowEngine(List<NodeExecutor> executorList,
                          WorkflowInstanceMapper instanceMapper,
                          WorkflowDefinitionMapper definitionMapper,
                          FormDataMapper formDataMapper,
                          TaskInstanceMapper taskInstanceMapper,
                          AssigneeLookupMapper assigneeLookupMapper) {
        this.instanceMapper = instanceMapper;
        this.definitionMapper = definitionMapper;
        this.formDataMapper = formDataMapper;
        this.taskInstanceMapper = taskInstanceMapper;
        this.assigneeLookupMapper = assigneeLookupMapper;
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

        return startWithDefinition(definition, initiatorId, bizType, bizId, formData, aiDraft);
    }

    /**
     * Load the form schema declared on the currently-published workflow definition for a
     * given bizType. Returns an empty schema if the definition has no {@code form:} block,
     * so callers can validate unconditionally.
     */
    public FormSchema loadFormSchemaByBizType(String bizType) {
        WorkflowDefinition def = definitionMapper.selectOne(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getBizType, bizType)
                        .eq(WorkflowDefinition::getStatus, "published")
                        .orderByDesc(WorkflowDefinition::getVersion)
                        .last("LIMIT 1")
        );
        if (def == null) return new FormSchema();
        return FormSchema.fromSnapshot(def.getConfigJson());
    }

    /**
     * Load the form schema pinned to a running workflow instance's frozen
     * definition_snapshot. Use this for mid-flow form edits / node submissions
     * so the instance keeps validating against the schema it started under,
     * even if admins publish a new version mid-flight.
     */
    public FormSchema loadFormSchemaForInstance(Long instanceId) {
        if (instanceId == null) return new FormSchema();
        WorkflowInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null) {
            throw new BizException("WORKFLOW_INSTANCE_NOT_FOUND",
                    "找不到工作流实例: " + instanceId);
        }
        return FormSchema.fromSnapshot(instance.getDefinitionSnapshot());
    }

    /**
     * Start a workflow by bizType instead of definition code. Resolves to the
     * latest published definition whose biz_type matches. Use this from business
     * services so the module ("leave" / "workstudy_position" / ...) isn't bound
     * to a specific definition code — admins can publish a new version and the
     * next invocation picks it up without code changes.
     */
    @Transactional
    public WorkflowInstance startWorkflowByBizType(String bizType, Long initiatorId, Long bizId,
                                                   Map<String, Object> formData,
                                                   Map<String, Object> aiDraft) {
        return startWorkflowByBizType(bizType, null, initiatorId, bizId, formData, aiDraft);
    }

    /**
     * A.1 学院 override 路由版：先按 (bizType, college_id=studentCollegeId)
     * 找已发布定义，找不到回落到 (bizType, college_id IS NULL) 的全校默认。
     * studentCollegeId=null 时直接走全校默认（跟无 override 行为一致）。
     */
    @Transactional
    public WorkflowInstance startWorkflowByBizType(String bizType, Long studentCollegeId,
                                                   Long initiatorId, Long bizId,
                                                   Map<String, Object> formData,
                                                   Map<String, Object> aiDraft) {
        WorkflowDefinition definition = resolveDefinition(bizType, studentCollegeId);
        if (definition == null) {
            throw new BizException("WORKFLOW_DEFINITION_NOT_FOUND",
                    "找不到 biz_type=" + bizType + " 的已发布工作流定义");
        }
        return startWithDefinition(definition, initiatorId, bizType, bizId, formData, aiDraft);
    }

    /**
     * Resolve published definition by (bizType, collegeId) with NULL fallback.
     * Returns the highest-version published row matching the most specific
     * scope first, then falls back to all-school default.
     */
    private WorkflowDefinition resolveDefinition(String bizType, Long studentCollegeId) {
        if (studentCollegeId != null) {
            WorkflowDefinition specific = definitionMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowDefinition>()
                            .eq(WorkflowDefinition::getBizType, bizType)
                            .eq(WorkflowDefinition::getCollegeId, studentCollegeId)
                            .eq(WorkflowDefinition::getStatus, "published")
                            .orderByDesc(WorkflowDefinition::getVersion)
                            .last("LIMIT 1")
            );
            if (specific != null) {
                return specific;
            }
        }
        return definitionMapper.selectOne(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getBizType, bizType)
                        .isNull(WorkflowDefinition::getCollegeId)
                        .eq(WorkflowDefinition::getStatus, "published")
                        .orderByDesc(WorkflowDefinition::getVersion)
                        .last("LIMIT 1")
        );
    }

    private WorkflowInstance startWithDefinition(WorkflowDefinition definition, Long initiatorId,
                                                 String bizType, Long bizId,
                                                 Map<String, Object> formData,
                                                 Map<String, Object> aiDraft) {
        Map<String, Object> snapshot = definition.getConfigJson();

        enforceInitiatorRole(snapshot, initiatorId);

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
            emitWorkflowRejectedEvent(instance, task, comment);
        }
    }

    private void emitWorkflowRejectedEvent(WorkflowInstance instance, TaskInstance task, String comment) {
        if (studentEventPublisher == null || instance.getBizType() == null) {
            return;
        }
        if (!"leave".equals(instance.getBizType())) {
            return;
        }
        Long studentId = instance.getInitiatorId();
        if (studentId == null) {
            return;
        }
        studentEventPublisher.publish(studentId, StudentEventType.LEAVE_REJECTED, "leave", Map.of(
                "leave_id", instance.getBizId() == null ? 0L : instance.getBizId(),
                "workflow_instance_id", instance.getId(),
                "rejected_node", task.getNodeId() == null ? "" : task.getNodeId(),
                "comment", comment == null ? "" : comment
        ));
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
     * Auto-complete a publicity task whose due_at has passed. Called by
     * {@code WorkflowDueScheduler}. Marks the task auto_advanced and moves the
     * instance to the publicity node's {@code next} target.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void completePublicity(Long taskId) {
        TaskInstance task = taskInstanceMapper.selectById(taskId);
        if (task == null || !"pending".equals(task.getStatus())) {
            return; // already handled (e.g. appeal arrived first)
        }

        OffsetDateTime now = OffsetDateTime.now();
        task.setStatus("auto_advanced");
        task.setCompletedAt(now);
        taskInstanceMapper.updateById(task);

        WorkflowInstance instance = instanceMapper.selectById(task.getWorkflowInstanceId());
        if (instance == null || !"running".equals(instance.getStatus())) return;

        Map<String, Object> nodeDef = findNodeInSnapshot(instance.getDefinitionSnapshot(), task.getNodeId());
        String nextNodeId = (String) nodeDef.get("next");
        if (nextNodeId == null) {
            // Treat missing next as termination — mark instance completed.
            instance.setStatus("completed");
            instance.setFinishedAt(now);
            instanceMapper.updateById(instance);
            return;
        }
        instance.setCurrentNodeId(nextNodeId);
        instanceMapper.updateById(instance);
        executeNode(instance, nextNodeId, 0);
    }

    /**
     * Receive an appeal/objection while a publicity node is pending. Marks the
     * publicity task interrupted and routes the instance to
     * {@code interrupt_on.next}.
     */
    @Transactional
    public void handleAppeal(Long instanceId, Long submitterId, String reason) {
        WorkflowInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null) {
            throw new BizException("WORKFLOW_NOT_FOUND", "工作流实例不存在: " + instanceId);
        }
        if (!"running".equals(instance.getStatus())) {
            throw new BizException("WORKFLOW_NOT_RUNNING", "工作流不在运行中，无法异议");
        }
        Map<String, Object> nodeDef = findNodeInSnapshot(instance.getDefinitionSnapshot(),
                instance.getCurrentNodeId());
        String typeStr = (String) nodeDef.get("type");
        if (typeStr == null || !NodeType.PUBLICITY.name().equalsIgnoreCase(typeStr)) {
            throw new BizException("WORKFLOW_NOT_IN_PUBLICITY",
                    "当前节点不是公示节点，无法接收异议");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> interruptOn = (Map<String, Object>) nodeDef.get("interrupt_on");
        if (interruptOn == null) {
            throw new BizException("WORKFLOW_PUBLICITY_NO_APPEAL",
                    "该公示节点未声明 interrupt_on，不接受异议");
        }
        String nextNodeId = (String) interruptOn.get("next");
        if (nextNodeId == null) {
            throw new BizException("WORKFLOW_PUBLICITY_NO_APPEAL",
                    "interrupt_on.next 未配置");
        }

        TaskInstance pending = taskInstanceMapper.selectOne(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .eq(TaskInstance::getNodeId, instance.getCurrentNodeId())
                        .eq(TaskInstance::getStatus, "pending")
                        .last("LIMIT 1")
        );
        if (pending == null) {
            // Race: scheduler beat the appeal; treat as already past-publicity.
            throw new BizException("WORKFLOW_PUBLICITY_ALREADY_DONE", "公示已结束，无法再异议");
        }

        OffsetDateTime now = OffsetDateTime.now();
        pending.setStatus("interrupted");
        String prefix = submitterId != null ? ("user " + submitterId + ": ") : "";
        pending.setComment(prefix + (reason == null ? "" : reason));
        pending.setCompletedAt(now);
        taskInstanceMapper.updateById(pending);

        instance.setCurrentNodeId(nextNodeId);
        instanceMapper.updateById(instance);
        executeNode(instance, nextNodeId, 0);
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

    /**
     * Optional DSL-level RBAC: if the definition declares
     * {@code initiator.roles: [codeA, codeB]}, reject starts from users whose
     * {@code sys_role.code} set is disjoint. Absence of the key means no
     * restriction (existing definitions keep working unchanged).
     */
    @SuppressWarnings("unchecked")
    private void enforceInitiatorRole(Map<String, Object> snapshot, Long initiatorId) {
        if (snapshot == null || initiatorId == null) return;
        Object initiatorCfg = snapshot.get("initiator");
        if (!(initiatorCfg instanceof Map<?, ?> map)) return;
        Object rolesObj = map.get("roles");
        if (!(rolesObj instanceof List<?> declared) || declared.isEmpty()) return;

        List<String> userRoles = assigneeLookupMapper.findRoleCodesByUserId(initiatorId);
        for (Object r : declared) {
            if (r != null && userRoles.contains(r.toString())) return;
        }
        throw new BizException("WORKFLOW_INITIATOR_FORBIDDEN",
                "当前角色无权发起该流程，允许角色：" + declared);
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
