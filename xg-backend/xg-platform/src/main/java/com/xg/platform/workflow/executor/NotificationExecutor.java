package com.xg.platform.workflow.executor;

import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationExecutor implements NodeExecutor {

    private final NotificationService notificationService;

    @Override
    public NodeType getType() {
        return NodeType.NOTIFICATION;
    }

    @Override
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        log.info("Notification node {} triggered for workflow instance {}", nodeDef.get("id"), instance.getId());

        try {
            String title = (String) nodeDef.get("title");
            String content = (String) nodeDef.get("content");

            @SuppressWarnings("unchecked")
            List<String> channels = (List<String>) nodeDef.get("channels");

            Map<String, Object> context = instance.getContext();
            Object applicantIdObj = context != null ? context.get("applicant_id") : null;
            if (applicantIdObj == null) {
                log.warn("No applicant_id in workflow instance {} context, skipping notification", instance.getId());
            } else {
                Long applicantId = ((Number) applicantIdObj).longValue();

                SendNotificationRequest req = new SendNotificationRequest();
                req.setTitle(title);
                req.setContent(content);
                req.setChannels(channels != null ? channels : List.of("in_app"));
                req.setSourceType("workflow");
                req.setSourceId(instance.getId());
                req.setRecipientUserIds(List.of(applicantId));

                notificationService.send(req);
            }
        } catch (Exception e) {
            log.warn("Notification node failed for workflow instance {}, continuing: {}", instance.getId(), e.getMessage());
        }

        String next = (String) nodeDef.get("next");
        return ExecutionResult.advance(next);
    }
}
