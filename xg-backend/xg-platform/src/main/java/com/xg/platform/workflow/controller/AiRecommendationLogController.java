package com.xg.platform.workflow.controller;

import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.workflow.mapper.AiRecommendationLogMapper;
import com.xg.platform.workflow.model.AiRecommendationLog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoint for the frontend to log "AI recommendation vs human decision"
 * tuples after an approve/reject action lands. Fire-and-forget — failures
 * here must never block the actual approval.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai-recommendations")
@RequiredArgsConstructor
public class AiRecommendationLogController {

    private final AiRecommendationLogMapper mapper;

    @PostMapping("/log")
    public R<Void> log(
            @RequestBody @Valid LogRequest req,
            @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId) {
        Long userId = CurrentUser.idOrNull();
        AiRecommendationLog row = new AiRecommendationLog();
        row.setTenantId(tenantId != null ? tenantId : "default");
        row.setTaskId(req.getTaskId());
        row.setBizType(req.getBizType());
        row.setBizId(req.getBizId());
        row.setAiRecommendation(req.getAiRecommendation());
        row.setAiHeadline(req.getAiHeadline());
        row.setAiRationale(req.getAiRationale());
        row.setAiModel(req.getAiModel());
        row.setHumanDecision(req.getHumanDecision());
        row.setHumanComment(req.getHumanComment());
        row.setApproverId(userId != null ? userId : req.getApproverId());
        row.setAgreementState(deriveAgreement(req.getAiRecommendation(), req.getHumanDecision()));
        try {
            mapper.insert(row);
        } catch (Exception e) {
            // Logging is observational — never let it cascade. Swallow + warn.
            log.warn("ai_recommendation_log insert failed taskId={}: {}", req.getTaskId(), e.getMessage());
        }
        return R.ok();
    }

    /**
     * Map AI rec × human decision to a single agreement bucket.
     * caution = "no firm position", treated as unclear regardless of human.
     * null AI recommendation = no_ai (LLM was unavailable when approver acted).
     */
    private static String deriveAgreement(String ai, String human) {
        if (ai == null || ai.isEmpty()) return "no_ai";
        if ("caution".equals(ai)) return "unclear";
        if (ai.equals(human)) return "agree";
        return "disagree";
    }

    @Data
    public static class LogRequest {
        @NotNull
        private Long taskId;
        private String bizType;
        private Long bizId;

        // AI snapshot (nullable — caller may not have AI rec)
        private String aiRecommendation;
        private String aiHeadline;
        private String aiRationale;
        private String aiModel;

        @NotBlank
        private String humanDecision; // approve | reject
        private String humanComment;

        // Backup approverId in case the X-User-Id header is absent
        private Long approverId;
    }
}
