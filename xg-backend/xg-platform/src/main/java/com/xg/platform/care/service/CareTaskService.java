package com.xg.platform.care.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.care.domain.CareTaskEvent;
import com.xg.platform.care.domain.CareTaskStatus;
import com.xg.platform.care.domain.CareTaskTransitions;
import com.xg.platform.care.dto.CareTaskQueryRequest;
import com.xg.platform.care.dto.RejectCareTaskRequest;
import com.xg.platform.care.dto.RescheduleCareTaskRequest;
import com.xg.platform.care.dto.ResolveCareTaskRequest;
import com.xg.platform.care.dto.TransferCareTaskRequest;
import com.xg.platform.care.error.CareTaskErrorCode;
import com.xg.platform.care.mapper.CareTaskAuditMapper;
import com.xg.platform.care.mapper.CareTaskFeedbackMapper;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.mapper.TaskAiBriefHistoryMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.model.CareTaskAudit;
import com.xg.platform.care.model.CareTaskFeedback;
import com.xg.platform.care.model.TaskAiBriefHistory;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.care.rule.RuleSpec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 关怀任务业务层：状态机由 {@link CareTaskTransitions} 静态常量表守门，
 * 所有状态变化必须走 {@link #applyTransition} 入口 —— 在事务内 update task + insert audit。
 *
 * <p>权限：除 OVERDUE_TICK（system actor）外，所有动作都要求当前 user == assigned_to。
 * <p>租户：依赖 MyBatis-Plus tenant plugin 自动注入 tenant_id WHERE；INSERT 显式 setTenantId 兜底。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareTaskService {

    /** 改期次数上限（W1 §10 "建议值 5"，产品最终拍） */
    private static final int RESCHEDULE_LIMIT = 5;

    private final CareTaskMapper careTaskMapper;
    private final CareTaskAuditMapper careTaskAuditMapper;
    private final CareTaskFeedbackMapper careTaskFeedbackMapper;
    private final TaskAiBriefHistoryMapper briefHistoryMapper;
    private final CareBriefService careBriefService;

    // ─────────────────────────── 查询 ───────────────────────────

    public PageResult<CareTask> list(CareTaskQueryRequest req) {
        LambdaQueryWrapper<CareTask> q = new LambdaQueryWrapper<>();

        // W2.2 安全收口：强制只看自己的任务，不认 assigneeScope=all。
        // assigneeScope=all（院系 / 学校视角）必须配套角色校验，W2.5 接通管理视图时再开，
        // 在此之前任何放开都是越权看全租户任务的口子。
        q.eq(CareTask::getAssignedTo, CurrentUser.id());
        if (req.getStudentId() != null) {
            q.eq(CareTask::getStudentId, req.getStudentId());
        }
        if (req.getStatuses() != null && !req.getStatuses().isEmpty()) {
            q.in(CareTask::getStatus, req.getStatuses());
        } else if (Boolean.FALSE.equals(req.getIncludeOverdue())) {
            q.ne(CareTask::getStatus, CareTaskStatus.OVERDUE.getCode());
        }
        if (req.getSeverities() != null && !req.getSeverities().isEmpty()) {
            q.in(CareTask::getSeverity, req.getSeverities());
        }
        if (req.getRescheduleAtLeast() != null) {
            q.ge(CareTask::getRescheduleCount, req.getRescheduleAtLeast());
        }

        // applySort 必须最后调用：内部用 q.last() 拼 ORDER BY，再追加其它条件会被甩到 ORDER BY 之后导致 SQL 非法
        applySort(q, req.getSort());

        Page<CareTask> page = careTaskMapper.selectPage(req.toPage(), q);
        return PageResult.of(page);
    }

    public CareTask detail(Long taskId) {
        return requireTask(taskId);
    }

    public Map<String, Object> getCurrentBrief(Long taskId) {
        CareTask task = requireTask(taskId);
        if (task.getCurrentBriefId() == null) {
            // 缺 brief 时返回 null data，由前端展示"小夕正在准备"+ 触发懒加载
            return null;
        }
        TaskAiBriefHistory history = briefHistoryMapper.selectById(task.getCurrentBriefId());
        return history == null ? null : history.getBrief();
    }

    /**
     * 触发 AI brief 生成。manual_refresh 走 5 分钟限流（PRD §11.1）；
     * lazy（前端详情发现 brief 缺失时调）不限流。生成失败按 §11.5 静默降级，不抛。
     */
    public void requestBriefRefresh(Long taskId, String trigger) {
        CareTask task = requireTask(taskId);
        if ("manual_refresh".equals(trigger) && careBriefService.generatedWithinMinutes(taskId, 5)) {
            throw new BizException(CareTaskErrorCode.CARE_BRIEF_REFRESH_TOO_FREQUENT);
        }
        careBriefService.generate(task, trigger);
    }

    // ─────────────────────────── 动作 ───────────────────────────

    @Transactional
    public void accept(Long taskId) {
        CareTask task = requireOwnedTask(taskId);
        OffsetDateTime now = OffsetDateTime.now();
        task.setAcceptedAt(now);
        task.setAcceptedBy(CurrentUser.id());
        applyTransition(task, CareTaskEvent.ACCEPT, null);
    }

    @Transactional
    public void resolve(Long taskId, ResolveCareTaskRequest req) {
        CareTask task = requireOwnedTask(taskId);
        OffsetDateTime now = OffsetDateTime.now();
        task.setClosedAt(now);
        task.setClosedBy(CurrentUser.id());
        task.setClosedReason("resolved");
        Map<String, Object> payload = new HashMap<>();
        if (req != null && req.getNote() != null) payload.put("note", req.getNote());
        applyTransition(task, CareTaskEvent.RESOLVE, payload);
    }

    @Transactional
    public void reject(Long taskId, RejectCareTaskRequest req) {
        if (req == null || req.getReasonCode() == null || req.getReasonCode().isBlank()) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_REJECT_REASON_REQUIRED);
        }
        CareTask task = requireOwnedTask(taskId);
        OffsetDateTime now = OffsetDateTime.now();
        task.setClosedAt(now);
        task.setClosedBy(CurrentUser.id());
        task.setClosedReason(req.getReasonCode());

        Map<String, Object> payload = new HashMap<>();
        payload.put("reason_code", req.getReasonCode());
        if (req.getReasonDetail() != null) payload.put("reason_detail", req.getReasonDetail());
        applyTransition(task, CareTaskEvent.REJECT, payload);

        // 拒绝同步写一条 feedback，喂回规则效果报表
        CareTaskFeedback fb = new CareTaskFeedback();
        fb.setTenantId(TenantContext.getTenantId());
        fb.setTaskId(taskId);
        fb.setFeedbackType("rejected_reason");
        fb.setReasonCode(req.getReasonCode());
        fb.setReasonDetail(req.getReasonDetail());
        fb.setSubmittedBy(CurrentUser.id());
        fb.setSubmittedAt(now);
        careTaskFeedbackMapper.insert(fb);
    }

    @Transactional
    public void reschedule(Long taskId, RescheduleCareTaskRequest req) {
        if (req == null || req.getDays() == null
                || !RescheduleCareTaskRequest.ALLOWED_DAYS.contains(req.getDays())) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_INVALID_TRANSITION);
        }
        CareTask task = requireOwnedTask(taskId);
        if (task.getRescheduleCount() != null && task.getRescheduleCount() >= RESCHEDULE_LIMIT) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_RESCHEDULE_LIMIT_EXCEEDED);
        }
        int days = req.getDays();
        task.setDueAt(task.getDueAt().plusDays(days));
        task.setRescheduleCount((task.getRescheduleCount() == null ? 0 : task.getRescheduleCount()) + 1);

        Map<String, Object> payload = new HashMap<>();
        payload.put("days", days);
        applyTransition(task, CareTaskEvent.RESCHEDULE, payload);
    }

    @Transactional
    public void transfer(Long taskId, TransferCareTaskRequest req) {
        if (req == null || req.getTargetDept() == null || req.getTargetDept().isBlank()
                || req.getReasonDetail() == null || req.getReasonDetail().isBlank()) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_TRANSFER_TARGET_REQUIRED);
        }
        CareTask task = requireOwnedTask(taskId);
        OffsetDateTime now = OffsetDateTime.now();
        task.setTransferredTo(req.getTargetDept());
        task.setClosedAt(now);
        task.setClosedBy(CurrentUser.id());
        task.setClosedReason("transferred");

        Map<String, Object> payload = new HashMap<>();
        payload.put("target_dept", req.getTargetDept());
        payload.put("reason_detail", req.getReasonDetail());
        applyTransition(task, CareTaskEvent.TRANSFER, payload);
    }

    // ─────────────────────── 状态机守门入口 ───────────────────────

    /**
     * 状态机统一入口。事务内：
     * 1. CareTaskTransitions.next() 校验 (from, event) 合法
     * 2. 更新 task 状态 + updatedAt
     * 3. 写一条 audit
     *
     * <p>不在这里 set 副作用字段（acceptedAt / closedReason / ...），副作用由调用方在调用前设置，
     * 这里只负责状态推进 + 审计 —— 让单测能针对状态机本身 vs 副作用分别覆盖。
     */
    private void applyTransition(CareTask task, CareTaskEvent event, Map<String, Object> payload) {
        CareTaskStatus from = CareTaskStatus.fromCode(task.getStatus())
                .orElseThrow(() -> new BizException(CareTaskErrorCode.CARE_TASK_INVALID_TRANSITION));
        CareTaskStatus to = CareTaskTransitions.next(from, event);

        task.setStatus(to.getCode());
        task.setUpdatedAt(OffsetDateTime.now());

        // 进终态时物化 cooldown_until = closed_at + rule.cooldown_days。
        // 物化而非每次回算：规则命中侧只需读 cooldown_until 判断是否抑制（见 CareTaskRuleMatchService）。
        if (to.isTerminal()) {
            int cooldownDays = CareRuleCatalog.findById(task.getRuleId())
                    .map(RuleSpec::cooldownDays).orElse(0);
            OffsetDateTime base = task.getClosedAt() != null
                    ? task.getClosedAt() : OffsetDateTime.now();
            task.setCooldownUntil(base.plusDays(cooldownDays));
        }
        careTaskMapper.updateById(task);

        CareTaskAudit audit = new CareTaskAudit();
        audit.setTenantId(TenantContext.getTenantId());
        audit.setTaskId(task.getId());
        audit.setAction(event.name().toLowerCase());
        audit.setFromStatus(from.getCode());
        audit.setToStatus(to.getCode());
        audit.setActorId(CurrentUser.idOrNull());
        audit.setActorRole("counselor"); // W2.2 简化：当前只有 counselor 调用动作 API；W2.5 接通 dean / system 时按 actor 推断
        audit.setPayload(payload);
        audit.setCreatedAt(OffsetDateTime.now());
        careTaskAuditMapper.insert(audit);
    }

    // ─────────────────────────── helpers ───────────────────────────

    private CareTask requireTask(Long taskId) {
        CareTask task = careTaskMapper.selectById(taskId);
        if (task == null) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_NOT_FOUND);
        }
        return task;
    }

    private CareTask requireOwnedTask(Long taskId) {
        CareTask task = requireTask(taskId);
        Long currentUserId = CurrentUser.id();
        if (task.getAssignedTo() == null || !task.getAssignedTo().equals(currentUserId)) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_NOT_ASSIGNED_TO_YOU);
        }
        return task;
    }

    /**
     * 排序：支持 severity_desc / due_asc / due_desc / created_desc / created_asc / reschedule_desc，
     * 多个用逗号；未识别项跳过。
     * severity_desc 用文本枚举顺序：critical > high > medium > low —— Postgres 字符串排序不对，所以用
     * CASE WHEN：因为 LambdaQueryWrapper 直接拼字符串麻烦，这里退化用 last() 注入。
     */
    private static void applySort(LambdaQueryWrapper<CareTask> q, String sort) {
        if (sort == null || sort.isBlank()) {
            q.last("ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, due_at ASC");
            return;
        }
        StringBuilder orderBy = new StringBuilder(" ORDER BY ");
        boolean first = true;
        for (String token : sort.split(",")) {
            String t = token.trim();
            String clause = switch (t) {
                case "severity_desc" ->
                        "CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END";
                case "due_asc" -> "due_at ASC";
                case "due_desc" -> "due_at DESC";
                case "created_desc" -> "created_at DESC";
                case "created_asc" -> "created_at ASC";
                case "reschedule_desc" -> "reschedule_count DESC";
                default -> null;
            };
            if (clause == null) continue;
            if (!first) orderBy.append(", ");
            orderBy.append(clause);
            first = false;
        }
        if (first) {
            // 全部无效，回退默认
            q.last("ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, due_at ASC");
        } else {
            q.last(orderBy.toString());
        }
    }

    // ─────────────────────────── 系统迁移 ───────────────────────────

    /**
     * 定时任务调用：把所有 due_at 已过 + 未关闭的任务迁移到 OVERDUE。
     * 不抛权限错误（system actor），W2.3 实现 scheduler 时调用。
     */
    @Transactional
    public int tickOverdue() {
        // 只取 pending / accepted：W1 §5.2 里只有这两态能 OVERDUE_TICK → overdue
        // （in_progress 已在跟进中，超期由 SLA 报表呈现，不进 overdue），不查它避免无谓抛/catch
        List<CareTask> candidates = careTaskMapper.selectList(
                new LambdaQueryWrapper<CareTask>()
                        .in(CareTask::getStatus,
                                CareTaskStatus.PENDING.getCode(),
                                CareTaskStatus.ACCEPTED.getCode())
                        .lt(CareTask::getDueAt, OffsetDateTime.now()));
        int migrated = 0;
        for (CareTask task : candidates) {
            try {
                applyTransitionAsSystem(task, CareTaskEvent.OVERDUE_TICK);
                migrated++;
            } catch (BizException e) {
                // 防御性：理论上 pending/accepted 都允许 OVERDUE_TICK，留 catch 不阻塞批处理
                log.debug("overdue tick skipped taskId={} reason={}", task.getId(), e.getMessage());
            }
        }
        return migrated;
    }

    private void applyTransitionAsSystem(CareTask task, CareTaskEvent event) {
        CareTaskStatus from = CareTaskStatus.fromCode(task.getStatus())
                .orElseThrow(() -> new BizException(CareTaskErrorCode.CARE_TASK_INVALID_TRANSITION));
        CareTaskStatus to = CareTaskTransitions.next(from, event);
        task.setStatus(to.getCode());
        task.setUpdatedAt(OffsetDateTime.now());
        careTaskMapper.updateById(task);

        CareTaskAudit audit = new CareTaskAudit();
        audit.setTenantId(TenantContext.getTenantId());
        audit.setTaskId(task.getId());
        audit.setAction(event.name().toLowerCase());
        audit.setFromStatus(from.getCode());
        audit.setToStatus(to.getCode());
        audit.setActorId(null);
        audit.setActorRole("system");
        audit.setCreatedAt(OffsetDateTime.now());
        careTaskAuditMapper.insert(audit);
    }
}
