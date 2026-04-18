package com.xg.platform.workflow.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.engine.BatchApproveResult;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowEngine workflowEngine;
    private final WorkflowDefinitionMapper definitionMapper;
    private final TaskInstanceMapper taskMapper;
    private final WorkflowInstanceMapper instanceMapper;

    // ---------------------- Definitions ----------------------

    @PostMapping("/definitions")
    public R<WorkflowDefinition> createDefinition(@RequestBody @Valid CreateDefinitionRequest req) {
        WorkflowDefinition def = new WorkflowDefinition();
        def.setCode(req.getCode());
        def.setName(req.getName());
        def.setModule(req.getModule());
        def.setConfigYaml(req.getConfigYaml());
        def.setStatus("draft");
        def.setVersion(1);
        definitionMapper.insert(def);
        return R.ok(def);
    }

    @PutMapping("/definitions/{id}")
    public R<WorkflowDefinition> updateDefinition(@PathVariable Long id,
                                                   @RequestBody @Valid UpdateDefinitionRequest req) {
        WorkflowDefinition existing = definitionMapper.selectById(id);
        if (existing == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }
        existing.setName(req.getName());
        existing.setConfigYaml(req.getConfigYaml());
        existing.setStatus(req.getStatus());
        existing.setVersion(existing.getVersion() + 1);
        definitionMapper.updateById(existing);
        return R.ok(existing);
    }

    @GetMapping("/definitions")
    public R<PageResult<WorkflowDefinition>> listDefinitions(@Valid PageQuery query,
                                                              @RequestParam(required = false) String module,
                                                              @RequestParam(required = false) String status) {
        Page<WorkflowDefinition> page = query.toPage();
        LambdaQueryWrapper<WorkflowDefinition> wrapper = new LambdaQueryWrapper<WorkflowDefinition>()
                .eq(module != null, WorkflowDefinition::getModule, module)
                .eq(status != null, WorkflowDefinition::getStatus, status)
                .orderByDesc(WorkflowDefinition::getCreatedAt);
        definitionMapper.selectPage(page, wrapper);
        return R.ok(PageResult.of(page));
    }

    @GetMapping("/definitions/{id}")
    public R<WorkflowDefinition> getDefinition(@PathVariable Long id) {
        WorkflowDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }
        return R.ok(def);
    }

    // ---------------------- Instances ----------------------

    @PostMapping("/instances")
    public R<WorkflowInstance> startWorkflow(@RequestBody @Valid StartWorkflowRequest req) {
        // TODO: get current user id from security context
        Long operatorId = req.getInitiatorId();
        WorkflowInstance instance = workflowEngine.startWorkflow(
                req.getDefinitionCode(),
                operatorId,
                req.getBizType(),
                req.getBizId(),
                req.getFormData(),
                req.getAiDraft()
        );
        return R.ok(instance);
    }

    @GetMapping("/instances/{id}")
    public R<WorkflowInstance> getInstance(@PathVariable Long id) {
        WorkflowInstance instance = instanceMapper.selectById(id);
        if (instance == null) {
            throw new BizException("NOT_FOUND", "工作流实例不存在");
        }
        return R.ok(instance);
    }

    @PostMapping("/instances/{id}/withdraw")
    public R<Void> withdraw(@PathVariable Long id, @RequestBody @Valid WithdrawRequest req) {
        workflowEngine.withdraw(id, req.getOperatorId());
        return R.ok();
    }

    // ---------------------- Tasks ----------------------

    @PostMapping("/tasks/{taskId}/approve")
    public R<Void> approve(@PathVariable Long taskId, @RequestBody @Valid ApprovalRequest req) {
        workflowEngine.handleApproval(taskId, "approve", req.getComment(), req.getOperatorId());
        return R.ok();
    }

    @PostMapping("/tasks/{taskId}/reject")
    public R<Void> reject(@PathVariable Long taskId, @RequestBody @Valid ApprovalRequest req) {
        workflowEngine.handleApproval(taskId, "reject", req.getComment(), req.getOperatorId());
        return R.ok();
    }

    @PostMapping("/tasks/batch-approve")
    public R<BatchApproveResult> batchApprove(@RequestBody @Valid BatchApproveRequest req) {
        BatchApproveResult result = workflowEngine.batchApprove(
                req.getTaskIds(), req.getAction(), req.getComment(), req.getOperatorId());
        return R.ok(result);
    }

    @GetMapping("/tasks/pending")
    public R<PageResult<TaskInstance>> pendingTasks(@Valid PageQuery query,
                                                     @RequestParam Long assigneeId) {
        Page<TaskInstance> page = query.toPage();
        taskMapper.selectPage(page,
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getAssigneeId, assigneeId)
                        .eq(TaskInstance::getStatus, "pending")
                        .orderByAsc(TaskInstance::getDueAt));
        return R.ok(PageResult.of(page));
    }

    @GetMapping("/tasks/history")
    public R<PageResult<TaskInstance>> taskHistory(@Valid PageQuery query,
                                                    @RequestParam Long assigneeId) {
        Page<TaskInstance> page = query.toPage();
        taskMapper.selectPage(page,
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getAssigneeId, assigneeId)
                        .in(TaskInstance::getStatus, List.of("approved", "rejected", "skipped"))
                        .orderByDesc(TaskInstance::getCompletedAt));
        return R.ok(PageResult.of(page));
    }

    // ---------------------- Request DTOs ----------------------

    @Data
    public static class CreateDefinitionRequest {
        @NotBlank
        private String code;
        @NotBlank
        private String name;
        private String module;
        @NotBlank
        private String configYaml;
    }

    @Data
    public static class UpdateDefinitionRequest {
        private String name;
        private String configYaml;
        private String status;
    }

    @Data
    public static class StartWorkflowRequest {
        @NotBlank
        private String definitionCode;
        @NotNull
        private Long initiatorId;
        private String bizType;
        private Long bizId;
        private Map<String, Object> formData;
        private Map<String, Object> aiDraft;
    }

    @Data
    public static class ApprovalRequest {
        @NotNull
        private Long operatorId;
        private String comment;
    }

    @Data
    public static class BatchApproveRequest {
        @NotNull
        @Size(min = 1, max = 50)
        private List<Long> taskIds;
        @NotBlank
        private String action;  // approve / reject
        private String comment;
        @NotNull
        private Long operatorId;
    }

    @Data
    public static class WithdrawRequest {
        @NotNull
        private Long operatorId;
    }
}
