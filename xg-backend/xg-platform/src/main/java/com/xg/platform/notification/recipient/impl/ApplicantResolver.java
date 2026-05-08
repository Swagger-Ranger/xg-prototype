package com.xg.platform.notification.recipient.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.recipient.RecipientType;
import com.xg.platform.notification.recipient.RecipientTypeResolver;
import com.xg.platform.notification.recipient.ResolvedRecipient;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ApplicantResolver implements RecipientTypeResolver {
    @Override
    public String type() { return RecipientType.APPLICANT.code(); }

    @Override
    public List<ResolvedRecipient> resolve(RecipientContext ctx, JsonNode spec) {
        if (ctx.applicantId() == null) return List.of();
        boolean cc = spec.path("cc").asBoolean(false);
        return List.of(new ResolvedRecipient(ctx.applicantId(), "student", cc));
    }
}
