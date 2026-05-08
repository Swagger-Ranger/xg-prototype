package com.xg.platform.workflow.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.xg.platform.insight.client.AiSidecarClient;
import com.xg.platform.workflow.engine.BatchApproveResult;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.form.FormSchema;
import com.xg.platform.workflow.form.FormSchemaDiff;
import com.xg.platform.system.mapper.SysRoleMapper;
import com.xg.platform.system.model.SysRole;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import com.xg.platform.workflow.service.InstanceTimelineService;
import com.xg.platform.workflow.vo.InstanceTimelineVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/v1/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowEngine workflowEngine;
    private final WorkflowDefinitionMapper definitionMapper;
    private final TaskInstanceMapper taskMapper;
    private final WorkflowInstanceMapper instanceMapper;
    private final AssigneeLookupMapper roleLookup;
    private final InstanceTimelineService timelineService;
    private final SysRoleMapper sysRoleMapper;
    private final AiSidecarClient aiSidecarClient;

    private static final String DEFINITION_ADMIN_ROLE = "school_admin";

    // ---------------------- Role catalog (read-only, for YAML editor hints) ----------------------

    /**
     * List sys_role catalog so the YAML editor can show available role codes
     * inline. Sorted by sort_order ascending (built-ins first by their seed
     * ordering, then any tenant-added roles).
     */
    @GetMapping("/role-codes")
    public R<List<RoleCodeView>> listRoleCodes() {
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>()
                        .select(SysRole::getCode, SysRole::getName, SysRole::getSortOrder)
                        .orderByAsc(SysRole::getSortOrder));
        List<RoleCodeView> out = new ArrayList<>(roles.size());
        for (SysRole r : roles) {
            RoleCodeView v = new RoleCodeView();
            v.setCode(r.getCode());
            v.setName(r.getName());
            out.add(v);
        }
        return R.ok(out);
    }

    // ---------------------- NL-driven definition author (admin only) ----------------------

    /**
     * Forward {currentDsl, instruction} to xg-ai's workflow_author agent and return
     * the (schema-validated) new DSL plus a one-line summary. Failures degrade
     * gracefully: ok=false with an error_message, never a 5xx — admins keep editing
     * by hand.
     */
    @PostMapping("/definitions/author")
    @SuppressWarnings("unchecked")
    public R<Map<String, Object>> authorDefinition(@RequestBody Map<String, Object> req,
                                                    @RequestHeader("X-User-Id") Long userId) {
        requireDefinitionAdmin(userId);
        Map<String, Object> body = new LinkedHashMap<>();
        // Accept both camelCase and snake_case so the endpoint is tolerant of
        // however a caller serialized the body — the global Jackson
        // PropertyNamingStrategy applies to typed DTOs but Map binding is
        // verbatim, so we read the keys ourselves.
        Object instructionRaw = req.getOrDefault("instruction", req.get("instruction"));
        Object currentDslRaw = req.getOrDefault("currentDsl", req.get("current_dsl"));
        String instruction = instructionRaw == null ? null : instructionRaw.toString();
        if (instruction == null || instruction.isBlank()) {
            body.put("ok", false);
            body.put("error_message", "instruction 不能为空");
            return R.ok(body);
        }
        if (!(currentDslRaw instanceof Map<?, ?> dslMap) || dslMap.isEmpty()) {
            body.put("ok", false);
            body.put("error_message", "current_dsl 不能为空");
            return R.ok(body);
        }
        // Inject the actual role catalog so the AI picks codes from reality
        // instead of inventing plausible-looking ones (e.g. "student_affairs"
        // when only "student_affairs_officer" exists).
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>()
                        .select(SysRole::getCode, SysRole::getName, SysRole::getSortOrder)
                        .orderByAsc(SysRole::getSortOrder));
        List<Map<String, String>> availableRoles = new ArrayList<>(roles.size());
        for (SysRole r : roles) {
            availableRoles.add(Map.of("code", r.getCode(), "name", r.getName()));
        }
        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("current_dsl", (Map<String, Object>) dslMap);
        ctx.put("instruction", instruction);
        ctx.put("available_roles", availableRoles);
        AiSidecarClient.AgentResult res = aiSidecarClient.invokeAgent(
                "workflow_author", ctx, Map.of(), null);
        body.put("attempts", res.output().getOrDefault("attempts", List.of()));
        body.put("summary", res.output().getOrDefault("summary", ""));
        if (!res.ok()) {
            body.put("ok", false);
            body.put("error_message", res.errorMessage());
            return R.ok(body);
        }
        Object dslObj = res.output().get("dsl");
        if (dslObj == null) {
            body.put("ok", false);
            body.put("error_message", res.output().getOrDefault("error_message", "AI 未返回有效 DSL"));
            return R.ok(body);
        }
        body.put("ok", true);
        body.put("dsl", dslObj);
        return R.ok(body);
    }

    // ---------------------- Form schema (public, read-only) ----------------------

    @GetMapping("/form-schema")
    public R<FormSchema> getFormSchema(@RequestParam(value = "bizType", required = false) String bizType,
                                       @RequestParam(value = "instanceId", required = false) Long instanceId) {
        if (instanceId != null) {
            return R.ok(workflowEngine.loadFormSchemaForInstance(instanceId));
        }
        if (bizType == null || bizType.isBlank()) {
            throw new BizException("INVALID_ARGUMENT", "bizType 或 instanceId 至少提供一个");
        }
        return R.ok(workflowEngine.loadFormSchemaByBizType(bizType));
    }

    // ---------------------- Definitions ----------------------

    @PostMapping("/definitions")
    public R<WorkflowDefinition> createDefinition(@RequestBody @Valid CreateDefinitionRequest req,
                                                   @RequestHeader("X-User-Id") Long userId) {
        requireDefinitionAdmin(userId);
        Map<String, Object> parsed = parseYaml(req.getConfigYaml());
        validateAssigneeRoles(parsed);
        WorkflowDefinition def = new WorkflowDefinition();
        def.setCode(req.getCode());
        def.setName(req.getName());
        def.setModule(req.getModule());
        def.setBizType(req.getBizType());
        def.setConfigYaml(req.getConfigYaml());
        def.setConfigJson(parsed);
        def.setStatus("draft");
        def.setVersion(1);
        definitionMapper.insert(def);
        return R.ok(def);
    }

    /**
     * "Update" semantics: each edit creates a new draft version row. In-flight instances
     * keep their old snapshot via WorkflowInstance.definitionSnapshot, so branching here
     * is safe and gives admins a versioned history.
     */
    @PutMapping("/definitions/{id}")
    public R<WorkflowDefinition> updateDefinition(@PathVariable Long id,
                                                   @RequestBody @Valid UpdateDefinitionRequest req,
                                                   @RequestHeader("X-User-Id") Long userId) {
        requireDefinitionAdmin(userId);
        WorkflowDefinition base = definitionMapper.selectById(id);
        if (base == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }
        Map<String, Object> parsed = parseYaml(req.getConfigYaml());
        validateAssigneeRoles(parsed);

        Integer maxVersion = definitionMapper.selectList(
                        new LambdaQueryWrapper<WorkflowDefinition>()
                                .eq(WorkflowDefinition::getCode, base.getCode())
                                .select(WorkflowDefinition::getVersion)
                                .orderByDesc(WorkflowDefinition::getVersion)
                                .last("LIMIT 1"))
                .stream().findFirst()
                .map(WorkflowDefinition::getVersion).orElse(1);

        WorkflowDefinition next = new WorkflowDefinition();
        next.setCode(base.getCode());
        next.setName(req.getName() != null ? req.getName() : base.getName());
        next.setModule(base.getModule());
        next.setBizType(req.getBizType() != null ? req.getBizType() : base.getBizType());
        next.setConfigYaml(req.getConfigYaml());
        next.setConfigJson(parsed);
        next.setStatus("draft");
        next.setVersion(maxVersion + 1);
        definitionMapper.insert(next);
        return R.ok(next);
    }

    /**
     * Publish a specific version. Same (tenant_id, code) has at most one row with
     * status='published' at any time — any existing published peer gets demoted to
     * disabled. In-flight instances are unaffected (snapshot-locked).
     */
    @PostMapping("/definitions/{id}/publish")
    @Transactional
    public R<WorkflowDefinition> publishDefinition(@PathVariable Long id,
                                                    @RequestHeader("X-User-Id") Long userId) {
        requireDefinitionAdmin(userId);
        WorkflowDefinition target = definitionMapper.selectById(id);
        if (target == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }
        if ("published".equals(target.getStatus())) {
            return R.ok(target);
        }

        WorkflowDefinition prior = findPriorPublished(target);
        if (prior != null) {
            List<FormSchemaDiff.Change> changes = FormSchemaDiff.diff(
                    FormSchema.fromSnapshot(prior.getConfigJson()),
                    FormSchema.fromSnapshot(target.getConfigJson()));
            if (FormSchemaDiff.maxLevel(changes) == FormSchemaDiff.Level.RED) {
                StringBuilder sb = new StringBuilder("发布被拦截：表单 schema 存在破坏性变更 — ");
                for (FormSchemaDiff.Change c : changes) {
                    if (c.level() == FormSchemaDiff.Level.RED) {
                        sb.append("[").append(c.kind()).append("] ").append(c.message()).append("; ");
                    }
                }
                sb.append("建议新建工作流定义（新 code）而不是修改已发布版本");
                throw new BizException("FORM_SCHEMA_BREAKING_CHANGE", sb.toString());
            }
        }

        // Demote any other published definition sharing either the same code (old
        // version of the same definition) or the same biz_type (a different code
        // that was previously wired to this business entry). This keeps the
        // invariant used by startWorkflowByBizType: at most one published row per
        // biz_type at any time.
        WorkflowDefinition demote = new WorkflowDefinition();
        demote.setStatus("disabled");
        LambdaQueryWrapper<WorkflowDefinition> demoteWrapper = new LambdaQueryWrapper<WorkflowDefinition>()
                .eq(WorkflowDefinition::getStatus, "published")
                .ne(WorkflowDefinition::getId, id)
                .and(w -> {
                    w.eq(WorkflowDefinition::getCode, target.getCode());
                    if (target.getBizType() != null) {
                        w.or().eq(WorkflowDefinition::getBizType, target.getBizType());
                    }
                });
        definitionMapper.update(demote, demoteWrapper);

        target.setStatus("published");
        definitionMapper.updateById(target);
        return R.ok(target);
    }

    /**
     * GUI form-editor save path: replaces the entire {@code form.fields} array of a
     * definition with the supplied list and writes a v+1 draft. Workflow nodes are
     * untouched. Admin still has to click {@code /publish} to make the change live;
     * publish runs the same FormSchemaDiff RED check as a YAML edit.
     */
    @SuppressWarnings("unchecked")
    @PutMapping("/definitions/{id}/form-fields")
    public R<WorkflowDefinition> updateFormFields(@PathVariable Long id,
                                                   @RequestBody @Valid UpdateFormFieldsRequest req,
                                                   @RequestHeader("X-User-Id") Long userId) {
        requireDefinitionAdmin(userId);
        WorkflowDefinition base = definitionMapper.selectById(id);
        if (base == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }

        List<UpdateFormFieldsRequest.FieldPayload> fields = req.getFields() == null
                ? List.of() : req.getFields();
        Set<String> seen = new HashSet<>();
        for (UpdateFormFieldsRequest.FieldPayload p : fields) {
            if (p.getName() == null || !p.getName().matches("^[a-z][a-z0-9_]{0,63}$")) {
                throw new BizException("INVALID_FIELD_NAME",
                        "字段标识必须是 snake_case: " + p.getName());
            }
            if (!seen.add(p.getName())) {
                throw new BizException("DUPLICATE_FIELD_NAME", "字段标识重复: " + p.getName());
            }
            if (p.getLabel() == null || p.getLabel().isBlank()) {
                throw new BizException("INVALID_ARGUMENT", "字段 " + p.getName() + " 缺少 label");
            }
            if (!Set.of("string", "number", "boolean", "date", "file").contains(p.getType())) {
                throw new BizException("UNSUPPORTED_FIELD_TYPE",
                        "暂不支持的字段类型: " + p.getType());
            }
            if ("file".equals(p.getType())) {
                if (p.getFileMaxCount() != null && p.getFileMaxCount() < 1) {
                    throw new BizException("INVALID_ARGUMENT",
                            "字段 " + p.getName() + " 的 fileMaxCount 必须 ≥ 1");
                }
            }
        }

        Map<String, Object> tree = parseYaml(base.getConfigYaml());
        Map<String, Object> form;
        Object formObj = tree.get("form");
        if (formObj instanceof Map) {
            form = (Map<String, Object>) formObj;
        } else {
            form = new LinkedHashMap<>();
            tree.put("form", form);
        }

        List<Map<String, Object>> nodes = new ArrayList<>(fields.size());
        for (UpdateFormFieldsRequest.FieldPayload p : fields) {
            nodes.add(buildFieldNode(p));
        }
        form.put("fields", nodes);

        String newYaml = dumpYaml(tree);

        Integer maxVersion = definitionMapper.selectList(
                        new LambdaQueryWrapper<WorkflowDefinition>()
                                .eq(WorkflowDefinition::getCode, base.getCode())
                                .select(WorkflowDefinition::getVersion)
                                .orderByDesc(WorkflowDefinition::getVersion)
                                .last("LIMIT 1"))
                .stream().findFirst()
                .map(WorkflowDefinition::getVersion).orElse(1);

        WorkflowDefinition next = new WorkflowDefinition();
        next.setCode(base.getCode());
        next.setName(base.getName());
        next.setModule(base.getModule());
        next.setBizType(base.getBizType());
        next.setConfigYaml(newYaml);
        next.setConfigJson(tree);
        next.setStatus("draft");
        next.setVersion(maxVersion + 1);
        definitionMapper.insert(next);
        return R.ok(next);
    }

    private Map<String, Object> buildFieldNode(UpdateFormFieldsRequest.FieldPayload p) {
        // LinkedHashMap so YAML serialization keeps the canonical key order.
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", p.getName());
        m.put("label", p.getLabel());
        m.put("type", p.getType());
        if (Boolean.TRUE.equals(p.getRequired())) m.put("required", true);
        if (Boolean.TRUE.equals(p.getDeprecated())) m.put("deprecated", true);
        if (notBlank(p.getPlaceholder())) m.put("placeholder", p.getPlaceholder());
        if (notBlank(p.getPattern())) m.put("pattern", p.getPattern());
        if (notBlank(p.getWidget())) m.put("widget", p.getWidget());
        if (p.getOptions() != null && !p.getOptions().isEmpty()) m.put("options", p.getOptions());
        if (p.getMin() != null) m.put("min", p.getMin());
        if (p.getMax() != null) m.put("max", p.getMax());
        if (p.getMinLength() != null) m.put("minLength", p.getMinLength());
        if (p.getMaxLength() != null) m.put("maxLength", p.getMaxLength());
        if (p.getFileMaxCount() != null) m.put("fileMaxCount", p.getFileMaxCount());
        if (notBlank(p.getFileAccept())) m.put("fileAccept", p.getFileAccept());
        if (p.getFileMaxSizeKb() != null) m.put("fileMaxSizeKb", p.getFileMaxSizeKb());
        return m;
    }

    private String dumpYaml(Map<String, Object> tree) {
        DumperOptions opts = new DumperOptions();
        opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        opts.setPrettyFlow(true);
        opts.setIndent(2);
        opts.setAllowUnicode(true);
        return new Yaml(opts).dump(tree);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * Preview the schema-change classification for a draft against its currently-published
     * predecessor. Used by the UI to show a diff before the admin clicks Publish.
     * Returns an empty list + maxLevel=GREEN if no prior published peer exists.
     */
    @GetMapping("/definitions/{id}/diff-preview")
    public R<DiffPreview> diffPreview(@PathVariable Long id) {
        WorkflowDefinition target = definitionMapper.selectById(id);
        if (target == null) {
            throw new BizException("NOT_FOUND", "工作流定义不存在");
        }
        WorkflowDefinition prior = findPriorPublished(target);
        if (prior == null) {
            return R.ok(new DiffPreview(List.of(), FormSchemaDiff.Level.GREEN.name(), false));
        }
        List<FormSchemaDiff.Change> changes = FormSchemaDiff.diff(
                FormSchema.fromSnapshot(prior.getConfigJson()),
                FormSchema.fromSnapshot(target.getConfigJson()));
        FormSchemaDiff.Level level = FormSchemaDiff.maxLevel(changes);
        return R.ok(new DiffPreview(changes, level.name(), level == FormSchemaDiff.Level.RED));
    }

    private WorkflowDefinition findPriorPublished(WorkflowDefinition target) {
        return definitionMapper.selectOne(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getStatus, "published")
                        .ne(WorkflowDefinition::getId, target.getId())
                        .and(w -> {
                            w.eq(WorkflowDefinition::getCode, target.getCode());
                            if (target.getBizType() != null) {
                                w.or().eq(WorkflowDefinition::getBizType, target.getBizType());
                            }
                        })
                        .orderByDesc(WorkflowDefinition::getVersion)
                        .last("LIMIT 1"));
    }

    public record DiffPreview(List<FormSchemaDiff.Change> changes, String maxLevel, boolean blocked) {}

    @GetMapping("/definitions")
    public R<PageResult<WorkflowDefinition>> listDefinitions(@Valid PageQuery query,
                                                              @RequestParam(required = false) String module,
                                                              @RequestParam(required = false) String status,
                                                              @RequestParam(required = false) String code,
                                                              @RequestParam(required = false) String bizType) {
        Page<WorkflowDefinition> page = query.toPage();
        LambdaQueryWrapper<WorkflowDefinition> wrapper = new LambdaQueryWrapper<WorkflowDefinition>()
                .eq(module != null, WorkflowDefinition::getModule, module)
                .eq(status != null, WorkflowDefinition::getStatus, status)
                .eq(code != null, WorkflowDefinition::getCode, code)
                .eq(bizType != null, WorkflowDefinition::getBizType, bizType)
                .orderByDesc(WorkflowDefinition::getCode)
                .orderByDesc(WorkflowDefinition::getVersion);
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

    @GetMapping("/instances/{id}/timeline")
    public R<InstanceTimelineVO> getInstanceTimeline(@PathVariable Long id,
                                                      @RequestHeader("X-User-Id") Long userId) {
        return R.ok(timelineService.buildTimeline(id, userId));
    }

    @PostMapping("/instances/{id}/withdraw")
    public R<Void> withdraw(@PathVariable Long id, @RequestBody @Valid WithdrawRequest req) {
        workflowEngine.withdraw(id, req.getOperatorId());
        return R.ok();
    }

    /**
     * Submit an appeal/objection to a publicity-period node mid-period. Routes
     * the workflow to {@code interrupt_on.next}. Anyone authenticated can call
     * this — finer-grained access (e.g. only target student or admin) belongs
     * to the business layer wrapper.
     */
    @PostMapping("/instances/{id}/appeal")
    public R<Void> appeal(@PathVariable Long id,
                          @RequestBody @Valid AppealRequest req,
                          @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        workflowEngine.handleAppeal(id, userId, req.getReason());
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

    // ---------------------- Helpers ----------------------

    /**
     * Guards workflow-definition management (create / update / publish) behind
     * {@code sys_role.code='school_admin'}. The project has not yet adopted a
     * global permission framework (sa-token is declared but unused), so this is
     * the narrowest enforcement that closes the most sensitive surface — the UI
     * already hides the page via {@code system:manage}, but a raw API call
     * previously bypassed all checks.
     */
    private void requireDefinitionAdmin(Long userId) {
        if (userId == null) {
            throw new BizException("UNAUTHENTICATED", "缺少用户身份");
        }
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (!roles.contains(DEFINITION_ADMIN_ROLE)) {
            throw new BizException("FORBIDDEN", "仅 " + DEFINITION_ADMIN_ROLE + " 角色可管理工作流定义");
        }
    }

    /**
     * Walk parsed YAML node tree, collect every {@code assignee.role} reference and
     * verify each maps to an existing {@code sys_role.code}. Surfaces typos like
     * {@code conselor} early instead of letting the workflow start and fail to
     * resolve assignees later. Empty / missing role nodes are not validated here
     * (those are caught by the assignee strategy at runtime).
     */
    @SuppressWarnings("unchecked")
    private void validateAssigneeRoles(Map<String, Object> parsed) {
        Object nodesObj = parsed.get("nodes");
        if (!(nodesObj instanceof List<?> nodes)) return;

        Set<String> referenced = new LinkedHashSet<>();
        for (Object n : nodes) {
            if (!(n instanceof Map<?, ?> node)) continue;
            // publicity nodes are system-driven; they have no assignee.role.
            Object type = node.get("type");
            if (type != null && "publicity".equalsIgnoreCase(type.toString())) continue;
            Object assignee = node.get("assignee");
            if (!(assignee instanceof Map<?, ?> a)) continue;
            Object role = a.get("role");
            if (role == null) continue;
            String r = role.toString().trim();
            if (!r.isEmpty()) referenced.add(r);
        }
        if (referenced.isEmpty()) return;

        List<SysRole> known = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>().select(SysRole::getCode));
        Set<String> knownCodes = new HashSet<>();
        for (SysRole r : known) knownCodes.add(r.getCode());

        List<String> unknown = new ArrayList<>();
        for (String r : referenced) {
            if (!knownCodes.contains(r)) unknown.add(r);
        }
        if (!unknown.isEmpty()) {
            throw new BizException(
                    "WORKFLOW_UNKNOWN_ROLE",
                    "YAML 引用了系统中不存在的角色 " + unknown
                            + "；可用角色: " + new ArrayList<>(knownCodes));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseYaml(String yaml) {
        if (yaml == null || yaml.isBlank()) {
            throw new BizException("WORKFLOW_INVALID_YAML", "configYaml 不能为空");
        }
        try {
            Object parsed = new Yaml().load(yaml);
            if (!(parsed instanceof Map)) {
                throw new BizException("WORKFLOW_INVALID_YAML", "configYaml 顶层必须是对象");
            }
            return (Map<String, Object>) parsed;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("WORKFLOW_INVALID_YAML", "configYaml 解析失败: " + e.getMessage());
        }
    }

    // ---------------------- Request DTOs ----------------------

    // The global Jackson PropertyNamingStrategy is SNAKE_CASE so multi-word
    // fields would normally only bind from snake_case JSON. Frontend sends
    // camelCase, so we accept both via @JsonAlias.
    @Data
    public static class CreateDefinitionRequest {
        @NotBlank
        private String code;
        @NotBlank
        private String name;
        private String module;
        @JsonAlias("bizType")
        private String bizType;
        @NotBlank
        @JsonAlias("configYaml")
        private String configYaml;
    }

    @Data
    public static class UpdateDefinitionRequest {
        private String name;
        @JsonAlias("bizType")
        private String bizType;
        @NotBlank
        @JsonAlias("configYaml")
        private String configYaml;
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

    @Data
    public static class RoleCodeView {
        private String code;
        private String name;
    }

    @Data
    public static class AppealRequest {
        @NotBlank
        private String reason;
    }

    @Data
    public static class UpdateFormFieldsRequest {
        @NotNull
        private List<FieldPayload> fields;

        @Data
        public static class FieldPayload {
            @NotBlank
            private String name;
            @NotBlank
            private String label;
            @NotBlank
            private String type;
            private Boolean required;
            private Boolean deprecated;
            private String placeholder;
            private String pattern;
            private String widget;
            private List<String> options;
            private Double min;
            private Double max;
            private Integer minLength;
            private Integer maxLength;
            private Integer fileMaxCount;
            private String fileAccept;
            private Long fileMaxSizeKb;
        }
    }
}
