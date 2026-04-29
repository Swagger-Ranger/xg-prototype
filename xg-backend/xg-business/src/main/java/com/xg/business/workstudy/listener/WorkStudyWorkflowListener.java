package com.xg.business.workstudy.listener;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Sync work-study business tables when their workflow instances reach a terminal state.
 *
 * <p>Three biz_type cases:
 * <ul>
 *   <li>{@code workstudy_position} — position.status flips to {@code open} (approved)
 *       or {@code closed} (rejected).</li>
 *   <li>{@code workstudy_application} — application.status flips to {@code hired}
 *       (approved) or {@code rejected}; on hire, the position's hired_count is
 *       incremented and the position auto-closes if it hits headcount.</li>
 *   <li>{@code workstudy_salary} — salary.status flips to {@code confirmed}
 *       (approved) or {@code rejected}.</li>
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
        if ("completed".equals(wf) || "approved".equals(wf)) {
            pos.setStatus("open");
        } else if ("rejected".equals(wf)) {
            pos.setStatus("closed");
        } else {
            return;
        }
        positionMapper.updateById(pos);
        log.info("Position {} status synced from workflow {}: {}", pos.getId(), event.getInstanceId(), pos.getStatus());
    }

    private void handleApplication(WorkflowFinishedEvent event) {
        WorkStudyApplication app = applicationMapper.selectById(event.getBizId());
        if (app == null) return;
        if (!"pending".equals(app.getStatus()) && !"recommended".equals(app.getStatus())) {
            return;   // already finalized via another path
        }
        String wf = event.getFinalStatus();
        if ("completed".equals(wf) || "approved".equals(wf)) {
            app.setStatus("hired");
            stampDecidedFromLastTask(app, event.getInstanceId());
            applicationMapper.updateById(app);
            bumpPositionHiredCount(app.getPositionId());
        } else if ("rejected".equals(wf)) {
            app.setStatus("rejected");
            stampDecidedFromLastTask(app, event.getInstanceId());
            applicationMapper.updateById(app);
        }
        log.info("Application {} status synced from workflow {}: {}", app.getId(), event.getInstanceId(), app.getStatus());
    }

    /** Backfill decided_by/decided_at from the most recently completed approval task. */
    private void stampDecidedFromLastTask(WorkStudyApplication app, Long instanceId) {
        if (instanceId == null) return;
        List<TaskInstance> tasks = taskMapper.selectList(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .in(TaskInstance::getStatus, "approved", "rejected")
                        .orderByDesc(TaskInstance::getCompletedAt)
        );
        if (tasks.isEmpty()) return;
        TaskInstance last = tasks.get(0);
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
        if ("completed".equals(wf) || "approved".equals(wf)) {
            salary.setStatus("confirmed");
            salary.setConfirmedAt(OffsetDateTime.now());
        } else if ("rejected".equals(wf)) {
            salary.setStatus("rejected");
        } else {
            return;
        }
        salaryMapper.updateById(salary);
        log.info("Salary {} status synced from workflow {}: {}", salary.getId(), event.getInstanceId(), salary.getStatus());
    }
}
