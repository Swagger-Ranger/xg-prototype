package com.xg.platform.insight.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Workspace insight response — the raw JSON in {@code metrics} and {@code insights}
 * is passed through to the client as-is so the frontend can render the structured
 * insight array directly.
 */
@Data
public class InsightResponse {
    private Long id;
    private String role;
    private String scopeKey;
    private OffsetDateTime generatedAt;
    private OffsetDateTime expiredAt;
    private String model;
    private String metrics;   // raw JSON string
    private String insights;  // raw JSON string
    private String status;
    private String errorMessage;
    /** itemIndex -> {up: N, down: N} — aggregated across all users. */
    private Map<Integer, Map<String, Long>> feedbackCounts;
    /** itemIndex -> "up"|"down" — only items the requesting user has voted on. */
    private Map<Integer, String> userVotes;
}
