package com.xg.business.workstudy.listener;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;

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
    private final NotificationService notificationService;

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

        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("workstudy_position");
        req.setSourceId(pos.getId());
        req.setRecipientUserIds(List.of(event.getInitiatorId()));
        req.setChannels(List.of("in_app"));

        if (approved) {
            req.setTitle("岗位审批通过");
            req.setContent(String.format("您发布的勤工岗位「%s」已通过审批，现已对学生开放申请。", title));
            req.setLevel("normal");
        } else {
            String reason = lastDecisionComment(event.getInstanceId());
            req.setTitle("岗位审批被驳回");
            req.setContent(reason != null && !reason.isBlank()
                    ? String.format("您发布的勤工岗位「%s」未通过审批：%s 您可修改后重新提交。", title, reason)
                    : String.format("您发布的勤工岗位「%s」未通过审批，您可修改后重新提交。", title));
            req.setLevel("important");
        }
        safeSend(req, "position decision", pos.getId());
    }

    private void notifyApplicationDecision(WorkStudyApplication app, boolean approved, Long instanceId) {
        if (app.getStudentId() == null) return;
        String positionTitle = "勤工岗位";
        if (app.getPositionId() != null) {
            WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
            if (pos != null && pos.getTitle() != null) positionTitle = pos.getTitle();
        }

        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("workstudy_application");
        req.setSourceId(app.getId());
        req.setRecipientUserIds(List.of(app.getStudentId()));
        req.setChannels(List.of("in_app"));

        if (approved) {
            req.setTitle("勤工申请已通过");
            req.setContent(String.format("您申请的「%s」岗位已通过审核，请按用人单位安排到岗。", positionTitle));
            req.setLevel("normal");
        } else {
            String reason = lastDecisionComment(instanceId);
            req.setTitle("勤工申请未通过");
            req.setContent(reason != null && !reason.isBlank()
                    ? String.format("您申请的「%s」岗位未通过审核：%s", positionTitle, reason)
                    : String.format("您申请的「%s」岗位未通过审核。", positionTitle));
            req.setLevel("important");
        }
        safeSend(req, "application decision", app.getId());
    }

    private void notifySalaryDecision(WorkStudySalary salary, boolean approved, WorkflowFinishedEvent event) {
        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("workstudy_salary");
        req.setSourceId(salary.getId());
        req.setChannels(List.of("in_app"));
        String month = salary.getMonth() != null ? salary.getMonth() : "本月";
        String amount = salary.getAmount() != null
                ? salary.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString()
                : "—";

        if (approved) {
            // Money is the student's; tell them.
            if (salary.getStudentId() == null) return;
            req.setRecipientUserIds(List.of(salary.getStudentId()));
            req.setTitle("勤工薪资已确认");
            req.setContent(String.format("您 %s 的勤工薪资 ¥%s 已审核通过。", month, amount));
            req.setLevel("normal");
        } else {
            // Rejection is actionable for the submitter (employer), not the student.
            if (event.getInitiatorId() == null) return;
            String reason = lastDecisionComment(event.getInstanceId());
            req.setRecipientUserIds(List.of(event.getInitiatorId()));
            req.setTitle("薪资单审核被驳回");
            req.setContent(reason != null && !reason.isBlank()
                    ? String.format("您提交的 %s 薪资单未通过审核：%s 请核对后重新提交。", month, reason)
                    : String.format("您提交的 %s 薪资单未通过审核，请核对后重新提交。", month));
            req.setLevel("important");
        }
        safeSend(req, "salary decision", salary.getId());
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

    private void safeSend(SendNotificationRequest req, String label, Long sourceId) {
        try {
            notificationService.send(req);
        } catch (Exception e) {
            log.warn("send {} notification failed source_id={}: {}", label, sourceId, e.getMessage());
        }
    }
}
