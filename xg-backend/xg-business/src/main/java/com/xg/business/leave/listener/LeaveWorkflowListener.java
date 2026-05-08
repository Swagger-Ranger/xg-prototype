package com.xg.business.leave.listener;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.notification.service.NotificationOrchestrator.Recipient;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sync {@code leave_request.status} when its workflow instance finishes, and
 * fire an in-app notification to the student so the decision is surfaced
 * outside of the workflow tab.
 *
 * <p>Two biz_type cases:
 * <ul>
 *   <li>{@code leave} — the original 请假 workflow. Flips {@code pending} →
 *       {@code approved/rejected}. Past-pending leaves are owned by
 *       cancellation paths and must not be overwritten.</li>
 *   <li>{@code leave_return} — the 销假 workflow. Flips {@code cancel_pending}
 *       → {@code cancelled} on approval, or back to {@code approved} on
 *       rejection.</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LeaveWorkflowListener {

    private final LeaveRequestMapper leaveRequestMapper;
    private final NotificationService notificationService;
    private final NotificationOrchestrator notificationOrchestrator;
    private final TaskInstanceMapper taskMapper;

    @EventListener
    public void onWorkflowFinished(WorkflowFinishedEvent event) {
        if (event.getBizId() == null) return;
        String bizType = event.getBizType();
        if ("leave".equals(bizType)) {
            handleLeaveApproval(event);
        } else if ("leave_return".equals(bizType)) {
            handleLeaveReturn(event);
        }
    }

    private void handleLeaveApproval(WorkflowFinishedEvent event) {
        String mapped = mapStatus(event.getFinalStatus());
        if (mapped == null) return;

        LeaveRequest leave = leaveRequestMapper.selectById(event.getBizId());
        if (leave == null) return;
        if (!"pending".equals(leave.getStatus())) {
            // Already past the pending gate — student/counselor cancellation paths
            // own this leave now; do not overwrite.
            return;
        }

        leave.setStatus(mapped);
        leaveRequestMapper.updateById(leave);
        log.info("Leave {} status synced from workflow: {} → {}",
                leave.getId(), event.getFinalStatus(), mapped);

        notifyLeaveDecision(leave, mapped, event.getInstanceId());
    }

    private void handleLeaveReturn(WorkflowFinishedEvent event) {
        LeaveRequest leave = leaveRequestMapper.selectById(event.getBizId());
        if (leave == null) return;
        if (!"cancel_pending".equals(leave.getStatus())) {
            // Status moved on (force-cancel etc.). Don't fight it.
            return;
        }
        String wfStatus = event.getFinalStatus();
        boolean approved = "completed".equals(wfStatus) || "approved".equals(wfStatus);
        boolean rejected = "rejected".equals(wfStatus);
        if (approved) {
            leave.setStatus("cancelled");
            leave.setCancelTime(OffsetDateTime.now());
            if (event.getInitiatorId() != null) {
                leave.setCancelledBy(event.getInitiatorId());
            }
            leaveRequestMapper.updateById(leave);
            log.info("Leave {} 销假 approved via workflow → cancelled", leave.getId());
        } else if (rejected) {
            // 销假 rejected → restore approved state. Clear cancel_time so the
            // leave looks normal again.
            leave.setStatus("approved");
            leave.setCancelTime(null);
            leaveRequestMapper.updateById(leave);
            log.info("Leave {} 销假 rejected via workflow → approved (rolled back)", leave.getId());
        } else {
            return;
        }

        notifyLeaveReturnDecision(leave, approved, event.getInstanceId());
    }

    private void notifyLeaveDecision(LeaveRequest leave, String mapped, Long instanceId) {
        if (leave.getStudentId() == null) return;
        // 通用模板:WORKFLOW_APPROVED / WORKFLOW_REJECTED 适用于任何工作流。
        // 业务侧负责拼 biz_label + summary,把具体业务上下文塞进通用文案。
        String templateCode = "approved".equals(mapped) ? "WORKFLOW_APPROVED" : "WORKFLOW_REJECTED";
        String typeName = leave.getLeaveTypeName() != null ? leave.getLeaveTypeName() : "请假";
        String summary = String.format("%s 至 %s 的%s",
                formatDate(leave.getStartTime()), formatDate(leave.getEndTime()), typeName);
        Map<String, Object> vars = new HashMap<>();
        vars.put("biz_label", "请假");
        vars.put("summary", summary);
        if (!"approved".equals(mapped)) {
            String reason = lastDecisionComment(instanceId);
            vars.put("reject_reason", reason != null && !reason.isBlank() ? reason : "未填写原因");
        }
        try {
            notificationOrchestrator.send(templateCode, "leave", leave.getId(),
                    List.of(Recipient.of(leave.getStudentId(), "student")), vars);
        } catch (Exception e) {
            log.warn("orchestrator send {} failed for leave {}: {}", templateCode, leave.getId(), e.getMessage());
        }
    }

    private void notifyLeaveReturnDecision(LeaveRequest leave, boolean approved, Long instanceId) {
        if (leave.getStudentId() == null) return;
        if (approved) {
            // 销假完成 → 走 Orchestrator (LEAVE_RETURNED 模板,渠道按偏好)
            Map<String, Object> vars = new HashMap<>();
            vars.put("leave_type_name", leave.getLeaveTypeName() != null ? leave.getLeaveTypeName() : "请假");
            vars.put("return_source_label", returnSourceLabel(leave.getReturnSource()));
            try {
                notificationOrchestrator.send("LEAVE_RETURNED", "leave", leave.getId(),
                        List.of(Recipient.of(leave.getStudentId(), "student")), vars);
            } catch (Exception e) {
                log.warn("orchestrator send LEAVE_RETURNED failed for leave {}: {}", leave.getId(), e.getMessage());
            }
            return;
        }
        // 销假驳回不在 P0 模板清单里 — 保留硬编码直发,等 P1 再纳入模板系统
        String type = leave.getLeaveTypeName() != null ? leave.getLeaveTypeName() : "请假";
        String reason = lastDecisionComment(instanceId);
        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("leave");
        req.setSourceId(leave.getId());
        req.setRecipientUserIds(List.of(leave.getStudentId()));
        req.setChannels(List.of("in_app"));
        req.setTitle("销假被驳回");
        req.setContent(reason != null && !reason.isBlank()
                ? String.format("您的销假申请被驳回：%s 请确认情况后重新提交。", reason)
                : "您的销假申请被驳回，请确认情况后重新提交。");
        req.setLevel("important");
        safeSend(req, "leave_return decision", leave.getId());
    }

    private static String returnSourceLabel(String source) {
        if (source == null) return "审批通过";
        return switch (source) {
            case "gps" -> "GPS 自助销假";
            case "auto" -> "自助销假";
            case "manual_approve" -> "辅导员审核通过";
            default -> "审批通过";
        };
    }

    private static String formatDate(OffsetDateTime t) {
        return t == null ? "" : t.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
    }

    /** Latest decision-bearing task comment for the instance, or null. Used to
     *  surface the counselor's rejection reason in the student-facing message. */
    private String lastDecisionComment(Long instanceId) {
        if (instanceId == null) return null;
        List<TaskInstance> tasks = taskMapper.selectList(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .in(TaskInstance::getStatus, "rejected", "approved")
                        .orderByDesc(TaskInstance::getCompletedAt));
        return tasks.isEmpty() ? null : tasks.get(0).getComment();
    }

    private void safeSend(SendNotificationRequest req, String label, Long sourceId) {
        try {
            notificationService.send(req);
        } catch (Exception e) {
            log.warn("send {} notification failed source_id={}: {}", label, sourceId, e.getMessage());
        }
    }

    /**
     * Map workflow terminal status to leave_request.status. Workflow YAML may
     * declare {@code status: completed | rejected | approved} on end nodes —
     * we accept both spellings for "approved" since leave_v2 uses
     * {@code completed} and admins may add new definitions with {@code approved}.
     */
    private String mapStatus(String workflowStatus) {
        if (workflowStatus == null) return null;
        return switch (workflowStatus) {
            case "completed", "approved" -> "approved";
            case "rejected" -> "rejected";
            default -> null;
        };
    }
}
