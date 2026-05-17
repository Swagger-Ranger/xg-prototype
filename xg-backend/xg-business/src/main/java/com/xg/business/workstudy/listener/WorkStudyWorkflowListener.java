package com.xg.business.workstudy.listener;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sync work-study business tables when their workflow instances reach a terminal
 * state, and fire in-app notifications so the relevant party (student or employer)
 * sees the decision outside of the workflow tab.
 *
 * <p>Three biz_type cases:
 * <ul>
 *   <li>{@code workstudy_position} — position.status flips to {@code open} (approved)
 *       or {@code closed} (rejected); employer is notified.</li>
 *   <li>{@code workstudy_application} — application.status flips to {@code hired}
 *       (approved) or {@code rejected}; on hire, the position's hired_count is
 *       incremented and the position auto-closes if it hits headcount; student
 *       is notified.</li>
 *   <li>{@code workstudy_salary} — salary.status flips to {@code confirmed}
 *       (approved) or {@code rejected}; student is notified on approval (the
 *       money is theirs), employer is notified on rejection (they need to fix
 *       and resubmit).</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkStudyWorkflowListener {

    private final WorkStudyPositionMapper positionMapper;
    private final WorkStudyApplicationMapper applicationMapper;
    private final WorkStudySalaryMapper salaryMapper;
    private final TaskInstanceMapper taskMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    @EventListener
    public void onWorkflowFinished(WorkflowFinishedEvent event) {
        if (event.getBizId() == null) return;
        String bizType = event.getBizType();
        if (bizType == null) return;
        switch (bizType) {
            case "workstudy_position" -> handlePosition(event);
            case "workstudy_application" -> handleApplication(event);
            case "workstudy_salary" -> handleSalary(event);
            default -> { /* not ours */ }
        }
    }

    private void handlePosition(WorkflowFinishedEvent event) {
        WorkStudyPosition pos = positionMapper.selectById(event.getBizId());
        if (pos == null) return;
        // Only act while position is still in the approval-pending window.
        if (!"pending_approval".equals(pos.getStatus()) && !"draft".equals(pos.getStatus())) {
            return;
        }
        String wf = event.getFinalStatus();
        boolean approved = "completed".equals(wf) || "approved".equals(wf);
        boolean rejected = "rejected".equals(wf);
        if (approved) {
            pos.setStatus("open");
        } else if (rejected) {
            pos.setStatus("closed");
        } else {
            return;
        }
        positionMapper.updateById(pos);
        log.info("Position {} status synced from workflow {}: {}", pos.getId(), event.getInstanceId(), pos.getStatus());

        notifyPositionDecision(pos, approved, event);
    }

    private void handleApplication(WorkflowFinishedEvent event) {
        WorkStudyApplication app = applicationMapper.selectById(event.getBizId());
        if (app == null) return;
        if (!"pending".equals(app.getStatus()) && !"recommended".equals(app.getStatus())) {
            return;   // already finalized via another path
        }
        String wf = event.getFinalStatus();
        boolean approved = "completed".equals(wf) || "approved".equals(wf);
        boolean rejected = "rejected".equals(wf);
        if (approved) {
            app.setStatus("hired");
            app.setEngagementStatus("on_duty");
            app.setEngagedAt(OffsetDateTime.now());
            stampDecidedFromLastTask(app, event.getInstanceId());
            applicationMapper.updateById(app);
            bumpPositionHiredCount(app.getPositionId());
        } else if (rejected) {
            app.setStatus("rejected");
            stampDecidedFromLastTask(app, event.getInstanceId());
            applicationMapper.updateById(app);
        } else {
            return;
        }
        log.info("Application {} status synced from workflow {}: {}", app.getId(), event.getInstanceId(), app.getStatus());

        notifyApplicationDecision(app, approved, event.getInstanceId());
    }

    /** Backfill decided_by/decided_at from the most recently completed approval task. */
    private void stampDecidedFromLastTask(WorkStudyApplication app, Long instanceId) {
        TaskInstance last = lastDecisionTask(instanceId);
        if (last == null) return;
        app.setDecidedBy(last.getAssigneeId());
        app.setDecidedAt(last.getCompletedAt() != null ? last.getCompletedAt() : OffsetDateTime.now());
    }

    private void bumpPositionHiredCount(Long positionId) {
        WorkStudyPosition pos = positionMapper.selectById(positionId);
        if (pos == null) return;
        int hired = (pos.getHiredCount() == null ? 0 : pos.getHiredCount()) + 1;
        pos.setHiredCount(hired);
        if (pos.getHeadcount() != null && hired >= pos.getHeadcount()) {
            pos.setStatus("closed");
        }
        positionMapper.updateById(pos);
    }

    private void handleSalary(WorkflowFinishedEvent event) {
        WorkStudySalary salary = salaryMapper.selectById(event.getBizId());
        if (salary == null) return;
        if (!"draft".equals(salary.getStatus()) && !"pending".equals(salary.getStatus())) {
            return;
        }
        String wf = event.getFinalStatus();
        boolean approved = "completed".equals(wf) || "approved".equals(wf);
        boolean rejected = "rejected".equals(wf);
        if (approved) {
            salary.setStatus("confirmed");
            salary.setConfirmedAt(OffsetDateTime.now());
        } else if (rejected) {
            salary.setStatus("rejected");
        } else {
            return;
        }
        salaryMapper.updateById(salary);
        log.info("Salary {} status synced from workflow {}: {}", salary.getId(), event.getInstanceId(), salary.getStatus());

        notifySalaryDecision(salary, approved, event);
    }

    private void notifyPositionDecision(WorkStudyPosition pos, boolean approved, WorkflowFinishedEvent event) {
        if (event.getInitiatorId() == null) return;
        String title = pos.getTitle() != null ? pos.getTitle() : "勤工岗位";
        // 复用通用 WORKFLOW_APPROVED / WORKFLOW_REJECTED 模板,与 leave 等其他流程一致
        Map<String, Object> vars = new HashMap<>();
        vars.put("biz_label", "岗位审批");
        vars.put("summary", String.format("发布的勤工岗位「%s」", title));
        if (!approved) {
            String reason = lastDecisionComment(event.getInstanceId());
            vars.put("reject_reason", reason != null && !reason.isBlank() ? reason : "无");
        }
        try {
            notificationOrchestrator.send(
                    approved ? "WORKFLOW_APPROVED" : "WORKFLOW_REJECTED",
                    "workstudy_position", pos.getId(),
                    RecipientContext.applicant(event.getInitiatorId()), vars);
        } catch (Exception e) {
            log.warn("send position decision notification failed source_id={}: {}", pos.getId(), e.getMessage());
        }
    }

    private void notifyApplicationDecision(WorkStudyApplication app, boolean approved, Long instanceId) {
        if (app.getStudentId() == null) return;
        String positionTitle = "勤工岗位";
        if (app.getPositionId() != null) {
            WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
            if (pos != null && pos.getTitle() != null) positionTitle = pos.getTitle();
        }
        Map<String, Object> vars = new HashMap<>();
        vars.put("biz_label", "勤工申请");
        vars.put("summary", String.format("申请的「%s」岗位", positionTitle));
        if (!approved) {
            String reason = lastDecisionComment(instanceId);
            vars.put("reject_reason", reason != null && !reason.isBlank() ? reason : "无");
        }
        try {
            notificationOrchestrator.send(
                    approved ? "WORKFLOW_APPROVED" : "WORKFLOW_REJECTED",
                    "workstudy_application", app.getId(),
                    RecipientContext.applicant(app.getStudentId()), vars);
        } catch (Exception e) {
            log.warn("send application decision notification failed source_id={}: {}", app.getId(), e.getMessage());
        }
    }

    private void notifySalaryDecision(WorkStudySalary salary, boolean approved, WorkflowFinishedEvent event) {
        String month = salary.getMonth() != null ? salary.getMonth() : "本月";
        String amount = salary.getAmount() != null
                ? salary.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString()
                : "—";

        if (approved) {
            // 钱是学生的,通知学生;走 WORKSTUDY_SALARY_CONFIRMED 自定义模板(带"到账提示")
            if (salary.getStudentId() == null) return;
            Map<String, Object> vars = new HashMap<>();
            vars.put("month", month);
            vars.put("amount", amount);
            try {
                notificationOrchestrator.send(
                        "WORKSTUDY_SALARY_CONFIRMED", "workstudy_salary", salary.getId(),
                        RecipientContext.applicant(salary.getStudentId()), vars);
            } catch (Exception e) {
                log.warn("send salary confirmed notification failed source_id={}: {}", salary.getId(), e.getMessage());
            }
        } else {
            // 驳回信息对申报人(employer)才有可操作性,复用通用 WORKFLOW_REJECTED
            if (event.getInitiatorId() == null) return;
            String reason = lastDecisionComment(event.getInstanceId());
            Map<String, Object> vars = new HashMap<>();
            vars.put("biz_label", "薪资单审核");
            vars.put("summary", String.format("提交的 %s 薪资单", month));
            vars.put("reject_reason", reason != null && !reason.isBlank() ? reason : "无");
            try {
                notificationOrchestrator.send(
                        "WORKFLOW_REJECTED", "workstudy_salary", salary.getId(),
                        RecipientContext.applicant(event.getInitiatorId()), vars);
            } catch (Exception e) {
                log.warn("send salary rejected notification failed source_id={}: {}", salary.getId(), e.getMessage());
            }
        }
    }

    private TaskInstance lastDecisionTask(Long instanceId) {
        if (instanceId == null) return null;
        List<TaskInstance> tasks = taskMapper.selectList(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .in(TaskInstance::getStatus, "approved", "rejected")
                        .orderByDesc(TaskInstance::getCompletedAt));
        return tasks.isEmpty() ? null : tasks.get(0);
    }

    private String lastDecisionComment(Long instanceId) {
        TaskInstance t = lastDecisionTask(instanceId);
        return t == null ? null : t.getComment();
    }

}
