package com.xg.platform.notification.recipient.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.recipient.RecipientType;
import com.xg.platform.notification.recipient.RecipientTypeResolver;
import com.xg.platform.notification.recipient.ResolvedRecipient;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class ApplicantClassMonitorResolver implements RecipientTypeResolver {

    private final AssigneeLookupMapper assigneeLookup;

    @Override
    public String type() { return RecipientType.APPLICANT_CLASS_MONITOR.code(); }

    @Override
    public List<ResolvedRecipient> resolve(RecipientContext ctx, JsonNode spec) {
        if (ctx.applicantId() == null) return List.of();
        boolean cc = spec.path("cc").asBoolean(false);
        return assigneeLookup.findClassRoleHoldersOfStudent("class_monitor", ctx.applicantId()).stream()
                .map(uid -> new ResolvedRecipient(uid, "class_monitor", cc))
                .toList();
    }
}
