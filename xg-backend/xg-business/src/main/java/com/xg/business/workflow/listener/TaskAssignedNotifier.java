package com.xg.business.workflow.listener;

import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.notification.service.NotificationOrchestrator.Recipient;
import com.xg.platform.workflow.event.TaskAssignedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Workflow task arrival notifier — every approval node creation fires
 * WORKFLOW_TASK_ARRIVED to all assignees via the notification center,
 * so admins control channels per role from one place. P0 lives in
 * xg-business so it can grow biz-specific summary lookups without
 * making the engine depend on biz mappers.
 *
 * <p>{@link TransactionalEventListener AFTER_COMMIT} so a failing notification
 * never rolls back the workflow transaction. Failures are swallowed and logged
 * — notifications are augmentations, not source-of-truth.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TaskAssignedNotifier {

    /** Map biz_type to a 中文 label that the WORKFLOW_TASK_ARRIVED template
     *  reads as {{biz_label}}. Anything outside the map falls back to "申请". */
    private static final Map<String, String> BIZ_LABELS = Map.of(
            "leave", "请假",
            "leave_return", "销假",
            "checkin", "签到",
            "collection", "信息收集",
            "violation", "违纪处分",
            "workstudy_application", "勤工助学申请",
            "workstudy_salary", "勤工助学薪资",
            "complaint", "投诉"
    );

    private final NotificationOrchestrator orchestrator;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onTaskAssigned(TaskAssignedEvent event) {
        if (event.getAssigneeIds() == null || event.getAssigneeIds().isEmpty()) return;

        String bizLabel = BIZ_LABELS.getOrDefault(event.getBizType(), "申请");
        Map<String, Object> vars = new HashMap<>();
        vars.put("biz_label", bizLabel);
        // 节点名("辅导员审批")写进 summary,管理员能看出在哪个环节卡住。
        vars.put("summary", event.getNodeName() != null ? event.getNodeName() : "审批");

        // 审批人的 role 这里不查 — 走模板默认渠道。如果管理员想给特定角色配偏好,
        // 在通知管理 UI 上显式覆盖即可,不强制 Listener 去 sys_user_role 查回再传。
        List<Recipient> recipients = event.getAssigneeIds().stream()
                .map(uid -> Recipient.of(uid, null))
                .toList();

        try {
            orchestrator.send("WORKFLOW_TASK_ARRIVED", event.getBizType(), event.getBizId(),
                    recipients, vars);
        } catch (Exception e) {
            log.warn("orchestrator send WORKFLOW_TASK_ARRIVED failed instance={} node={}: {}",
                    event.getInstanceId(), event.getNodeId(), e.getMessage());
        }
    }
}
