package com.xg.platform.notification.recipient.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.recipient.RecipientType;
import com.xg.platform.notification.recipient.RecipientTypeResolver;
import com.xg.platform.notification.recipient.ResolvedRecipient;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class CurrentApproverResolver implements RecipientTypeResolver {
    @Override
    public String type() { return RecipientType.CURRENT_APPROVER.code(); }

    @Override
    public List<ResolvedRecipient> resolve(RecipientContext ctx, JsonNode spec) {
        if (ctx.currentApproverIds().isEmpty()) return List.of();
        boolean cc = spec.path("cc").asBoolean(false);
        // role 不查 — 当前审批人可能是任意角色(辅导员 / 院长 / 班主任...)。
        // 不传 role → Orchestrator 走模板默认渠道,管理员要给特定角色配偏好就走偏好覆盖。
        return ctx.currentApproverIds().stream()
                .map(uid -> new ResolvedRecipient(uid, null, cc))
                .toList();
    }
}
