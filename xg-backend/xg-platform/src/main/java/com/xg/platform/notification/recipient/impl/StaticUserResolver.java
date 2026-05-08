package com.xg.platform.notification.recipient.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.recipient.RecipientType;
import com.xg.platform.notification.recipient.RecipientTypeResolver;
import com.xg.platform.notification.recipient.ResolvedRecipient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/** 兜底:管理员可在模板里写死某个 user_id(运维场景,例如所有错误通知发给某个监控账号)。 */
@Slf4j
@Component
public class StaticUserResolver implements RecipientTypeResolver {

    @Override
    public String type() { return RecipientType.STATIC_USER.code(); }

    @Override
    public List<ResolvedRecipient> resolve(RecipientContext ctx, JsonNode spec) {
        JsonNode uidNode = spec.get("user_id");
        if (uidNode == null || !uidNode.isNumber()) {
            log.warn("static_user spec missing user_id: {}", spec);
            return List.of();
        }
        boolean cc = spec.path("cc").asBoolean(false);
        return List.of(new ResolvedRecipient(uidNode.asLong(), null, cc));
    }
}
