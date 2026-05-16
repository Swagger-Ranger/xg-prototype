package com.xg.platform.care.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareBriefQueryMapper;
import com.xg.platform.care.mapper.CareTaskAuditMapper;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.model.CareTaskAudit;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.care.rule.RuleHit;
import com.xg.platform.care.rule.RuleSpec;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 规则命中 → care_task 的唯一入口：决定 create / merge / suppress。
 *
 * <p>铁律（《主动关怀任务去重与冷却落地方案.md》）：同一 (tenant, student, rule)
 * 未关闭时只维护 1 条任务；新命中只追加证据 / 升级严重度；关闭后冷却期内抑制重开。
 *
 * <p>与状态机入口 {@link CareTaskService} 分离：本类只管"规则侧生成"，
 * CareTaskService 只管"辅导员侧动作"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareTaskRuleMatchService {

    private static final List<String> OPEN_STATUSES =
            List.of("pending", "accepted", "in_progress", "overdue");
    private static final List<String> CLOSED_STATUSES =
            List.of("resolved", "rejected", "transferred");

    private final CareTaskMapper careTaskMapper;
    private final CareTaskAuditMapper careTaskAuditMapper;
    private final AssigneeLookupMapper assigneeLookupMapper;
    private final NotificationOrchestrator notificationOrchestrator;
    private final CareBriefQueryMapper careBriefQueryMapper;

    @Transactional
    public CareTaskUpsertResult upsert(RuleSpec spec, RuleHit hit) {
        if (hit.studentId() == null) {
            return CareTaskUpsertResult.SKIPPED_NO_ASSIGNEE;
        }
        OffsetDateTime now = OffsetDateTime.now();

        CareTask open = findOpenTask(hit.studentId(), spec.ruleId());
        if (open != null) {
            return merge(open, spec, hit, now);
        }

        CareTask closed = findLatestClosedTask(hit.studentId(), spec.ruleId());
        if (closed != null && closed.getCooldownUntil() != null
                && closed.getCooldownUntil().isAfter(now)) {
            writeAudit(closed.getId(), "suppressed_by_cooldown",
                    closed.getStatus(), closed.getStatus(),
                    Map.of("rule_id", spec.ruleId(), "cooldown_until",
                            String.valueOf(closed.getCooldownUntil())));
            return CareTaskUpsertResult.SUPPRESSED;
        }

        return create(spec, hit, now);
    }

    // ─────────────────────── merge ───────────────────────

    private CareTaskUpsertResult merge(CareTask open, RuleSpec spec, RuleHit hit, OffsetDateTime now) {
        // 最新快照覆盖（不维护样本数组）；全量明细以 student_event_log 为准
        open.setTriggerData(hit.triggerData());
        open.setLastTriggeredAt(now);
        open.setTriggerCount((open.getTriggerCount() == null ? 1 : open.getTriggerCount()) + 1);
        open.setUpdatedAt(now);

        boolean upgraded = rank(spec.severity()) > rank(open.getSeverity());
        if (upgraded) {
            open.setSeverity(spec.severity());
            OffsetDateTime newDue = now.plusHours(slaHours(spec.severity()));
            if (open.getDueAt() == null || newDue.isBefore(open.getDueAt())) {
                open.setDueAt(newDue);
            }
        }
        careTaskMapper.updateById(open);

        Map<String, Object> payload = new HashMap<>();
        payload.put("rule_id", spec.ruleId());
        payload.put("trigger_count", open.getTriggerCount());
        if (upgraded) {
            payload.put("new_severity", spec.severity());
            writeAudit(open.getId(), "severity_upgraded",
                    open.getStatus(), open.getStatus(), payload);
        } else {
            writeAudit(open.getId(), "evidence_appended",
                    open.getStatus(), open.getStatus(), payload);
        }
        return CareTaskUpsertResult.MERGED;
    }

    // ─────────────────────── create ───────────────────────

    private CareTaskUpsertResult create(RuleSpec spec, RuleHit hit, OffsetDateTime now) {
        Long assignee = resolveAssignee(hit.studentId());
        if (assignee == null) {
            log.warn("care task skipped: no counselor for student={} rule={}",
                    hit.studentId(), spec.ruleId());
            return CareTaskUpsertResult.SKIPPED_NO_ASSIGNEE;
        }

        CareTask task = new CareTask();
        task.setTenantId(TenantContext.getTenantId());
        task.setStudentId(hit.studentId());
        task.setRuleId(spec.ruleId());
        task.setRuleVersion(CareRuleCatalog.RULE_VERSION);
        task.setSeverity(spec.severity());
        task.setTriggerData(hit.triggerData());
        task.setStatus("pending");
        task.setAssignedTo(assignee);
        task.setDueAt(now.plusHours(slaHours(spec.severity())));
        task.setRescheduleCount(0);
        task.setTriggerCount(1);
        task.setLastTriggeredAt(now);
        task.setCreatedAt(now);
        task.setUpdatedAt(now);

        try {
            careTaskMapper.insert(task);
        } catch (DuplicateKeyException e) {
            // 并发兜底：另一事务在 findOpen 与 insert 之间已建同一 open 任务，
            // partial unique index 拦下。视为已处理，不重复建。
            log.debug("care task insert raced (open unique) student={} rule={}",
                    hit.studentId(), spec.ruleId());
            return CareTaskUpsertResult.SUPPRESSED;
        }

        writeAudit(task.getId(), "created", "none", "pending",
                Map.of("rule_id", spec.ruleId(), "severity", spec.severity()));
        notifyOnCreate(task);
        return CareTaskUpsertResult.CREATED;
    }

    /**
     * 任务创建即时通知（PRD §12）。high / critical 走 Orchestrator（铁律：
     * 不绕开、不拼文案）；medium 走每日聚合、low 站内待办即任务本身，不在此发。
     * 通知失败不得影响任务创建 —— best-effort，吞异常。
     */
    private void notifyOnCreate(CareTask task) {
        try {
            CareNotifyPolicy.codeForCreate(task.getSeverity()).ifPresent(code -> {
                Map<String, Object> vars = new HashMap<>();
                if (CareNotifyPolicy.CRITICAL_DASHBOARD.equals(code)) {
                    // §12.2 critical_dashboard 文案含 {{college_name}} {{n}}
                    vars.put("n", "1");
                    vars.put("college_name", resolveCollege(task.getStudentId()));
                }
                notificationOrchestrator.send(code, "care_task", task.getId(),
                        RecipientContext.applicant(task.getAssignedTo()), vars);
            });
        } catch (Exception e) {
            log.warn("care notifyOnCreate failed taskId={} severity={}: {}",
                    task.getId(), task.getSeverity(), e.getMessage());
        }
    }

    private String resolveCollege(Long studentId) {
        try {
            Map<String, Object> info =
                    careBriefQueryMapper.studentBasicInfo(TenantContext.getTenantId(), studentId);
            Object c = info == null ? null : info.get("college");
            return c == null ? "" : c.toString();
        } catch (Exception e) {
            return "";
        }
    }

    // ─────────────────────── helpers ───────────────────────

    /**
     * FOR UPDATE 行锁：upsert 是 @Transactional，两个并发 scan 命中同一 open 任务时
     * 序列化 merge，避免后写覆盖先写的 trigger_count / trigger_data（丢更新）。
     * 无 open 行时不锁任何行，create 路径靠 partial unique index + DuplicateKey 兜底。
     */
    private CareTask findOpenTask(Long studentId, String ruleId) {
        List<CareTask> rows = careTaskMapper.selectList(new LambdaQueryWrapper<CareTask>()
                .eq(CareTask::getStudentId, studentId)
                .eq(CareTask::getRuleId, ruleId)
                .in(CareTask::getStatus, OPEN_STATUSES)
                .last("limit 1 for update"));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private CareTask findLatestClosedTask(Long studentId, String ruleId) {
        List<CareTask> rows = careTaskMapper.selectList(new LambdaQueryWrapper<CareTask>()
                .eq(CareTask::getStudentId, studentId)
                .eq(CareTask::getRuleId, ruleId)
                .in(CareTask::getStatus, CLOSED_STATUSES)
                .orderByDesc(CareTask::getClosedAt)
                .last("limit 1"));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 单责任人：is_primary 优先，回退班主任；都没有返回 null。 */
    private Long resolveAssignee(Long studentId) {
        Long primary = assigneeLookupMapper.findPrimaryCounselorOfStudent(studentId);
        if (primary != null) {
            return primary;
        }
        List<Long> classMaster = assigneeLookupMapper.findClassMasterOfStudent(studentId);
        return (classMaster == null || classMaster.isEmpty()) ? null : classMaster.get(0);
    }

    private void writeAudit(Long taskId, String action,
                            String fromStatus, String toStatus,
                            Map<String, Object> payload) {
        CareTaskAudit audit = new CareTaskAudit();
        audit.setTenantId(TenantContext.getTenantId());
        audit.setTaskId(taskId);
        audit.setAction(action);
        audit.setFromStatus(fromStatus);
        audit.setToStatus(toStatus);
        audit.setActorId(null);
        audit.setActorRole("system");
        audit.setPayload(payload);
        audit.setCreatedAt(OffsetDateTime.now());
        careTaskAuditMapper.insert(audit);
    }

    /** 严重度序：low < medium < high < critical。 */
    private static int rank(String severity) {
        return switch (severity == null ? "" : severity) {
            case "critical" -> 3;
            case "high" -> 2;
            case "medium" -> 1;
            case "low" -> 0;
            default -> 0;
        };
    }

    /** PRD §9.3：severity → SLA 小时数。 */
    private static long slaHours(String severity) {
        return switch (severity == null ? "" : severity) {
            case "critical" -> 24;
            case "high" -> 48;
            case "medium" -> 24 * 7;
            case "low" -> 24 * 14;
            default -> 24 * 7;
        };
    }
}
