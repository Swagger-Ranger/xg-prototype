package com.xg.business.ai.controller;

import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.common.base.R;
import com.xg.platform.workflow.mapper.AiRecommendationLogMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only AI observability endpoint backing the /system "AI 表现" tab.
 * Aggregates two signals:
 *   1. AI approval recommendation agreement — from ai_recommendation_log
 *   2. AI Draft per-field accuracy — from leave_request.ai_draft vs final values
 * Plus a sample of recent disagreement rows for prompt-tuning forensics.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/system/ai-metrics")
@RequiredArgsConstructor
public class AiMetricsController {

    private static final int DEFAULT_DAYS = 7;
    private static final int MAX_DAYS = 90;
    private static final int DISAGREEMENT_LIMIT = 10;

    private final AiRecommendationLogMapper logMapper;
    private final LeaveRequestMapper leaveMapper;

    @GetMapping
    public R<MetricsResponse> get(@RequestParam(defaultValue = "7") int days) {
        int window = Math.max(1, Math.min(days, MAX_DAYS));

        // 1. recommendation agreement
        RecommendationStats rec = new RecommendationStats();
        for (Map<String, Object> row : logMapper.countByAgreement(window)) {
            String state = String.valueOf(row.get("agreement_state"));
            long cnt = toLong(row.get("cnt"));
            switch (state) {
                case "agree" -> rec.setAgree(cnt);
                case "disagree" -> rec.setDisagree(cnt);
                case "unclear" -> rec.setUnclear(cnt);
                case "no_ai" -> rec.setNoAi(cnt);
                default -> {} // ignore future-added states
            }
        }
        rec.setTotal(rec.getAgree() + rec.getDisagree() + rec.getUnclear() + rec.getNoAi());
        long firmDecisions = rec.getAgree() + rec.getDisagree();
        rec.setAgreementRate(firmDecisions > 0
                ? Math.round(rec.getAgree() * 1000.0 / firmDecisions) / 10.0
                : null);

        // 2. ai_draft per-field accuracy
        DraftStats draft = new DraftStats();
        Map<String, Object> drow = leaveMapper.draftFieldAccuracy(window);
        if (drow != null) {
            draft.setTotalWithDraft(toLong(drow.get("total")));
            draft.getFields().add(buildField("leave_type", drow));
            draft.getFields().add(buildField("reason", drow));
            draft.getFields().add(buildField("start_date", drow));
            draft.getFields().add(buildField("end_date", drow));
            draft.getFields().add(buildField("destination", drow));
        }

        // 3. recent disagreement samples
        List<Map<String, Object>> samples = logMapper.recentDisagreements(window, DISAGREEMENT_LIMIT);

        MetricsResponse resp = new MetricsResponse();
        resp.setDays(window);
        resp.setRecommendation(rec);
        resp.setDraft(draft);
        resp.setRecentDisagreements(samples);
        return R.ok(resp);
    }

    private static FieldAccuracy buildField(String name, Map<String, Object> row) {
        long match = toLong(row.get(name + "_match"));
        long mismatch = toLong(row.get(name + "_mismatch"));
        FieldAccuracy fa = new FieldAccuracy();
        fa.setField(name);
        fa.setMatch(match);
        fa.setMismatch(mismatch);
        long denom = match + mismatch;
        fa.setAccuracy(denom > 0 ? Math.round(match * 1000.0 / denom) / 10.0 : null);
        return fa;
    }

    private static long toLong(Object v) {
        if (v == null) return 0L;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (NumberFormatException e) { return 0L; }
    }

    @Data
    public static class MetricsResponse {
        private int days;
        private RecommendationStats recommendation = new RecommendationStats();
        private DraftStats draft = new DraftStats();
        private List<Map<String, Object>> recentDisagreements = new ArrayList<>();
    }

    @Data
    public static class RecommendationStats {
        private long total;
        private long agree;
        private long disagree;
        private long unclear;
        private long noAi;
        /** Percent — agree / (agree + disagree). null when no firm decisions yet. */
        private Double agreementRate;
    }

    @Data
    public static class DraftStats {
        private long totalWithDraft;
        private List<FieldAccuracy> fields = new ArrayList<>();
    }

    @Data
    public static class FieldAccuracy {
        private String field;
        private long match;
        private long mismatch;
        /** Percent — match / (match + mismatch). null when AI never tried this field. */
        private Double accuracy;
    }

    // suppress unused warning in case future logic walks the response with a HashMap
    private static Map<String, Object> _kv(String k, Object v) {
        Map<String, Object> m = new HashMap<>();
        m.put(k, v);
        return m;
    }
}
