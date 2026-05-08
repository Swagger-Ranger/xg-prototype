package com.xg.platform.insight.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.insight.client.AiSidecarClient;
import com.xg.platform.insight.mapper.WorkspaceInsightMapper;
import com.xg.platform.insight.metrics.WorkspaceMetricsService;
import com.xg.platform.insight.model.WorkspaceInsight;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Workspace insight service — orchestrates on-demand and scheduled generation.
 *
 * Each call persists a new {@code workspace_insight} row even on failure
 * (status="error", error_message populated), so the controller always returns
 * something and the scheduler produces an audit trail.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InsightService {

    private static final int EXPIRY_HOURS = 36;

    private final WorkspaceInsightMapper insightMapper;
    private final WorkspaceMetricsService metricsService;
    private final AiSidecarClient aiClient;
    private final ObjectMapper objectMapper;

    public WorkspaceInsight getLatest(String role, String scopeKey) {
        return insightMapper.findLatest(role, scopeKey);
    }

    public WorkspaceInsight refresh(String role, String scopeKey, String callerUserId) {
        return refresh(role, scopeKey, null, callerUserId);
    }

    public WorkspaceInsight refresh(String role, String scopeKey, Long classId, String callerUserId) {
        Map<String, Object> metrics;
        try {
            if ("counselor".equals(role)) {
                // scope_key is either "<userId>" or "<userId>:class:<classId>" — parse counselor id from prefix
                String counselorSegment = scopeKey.contains(":") ? scopeKey.substring(0, scopeKey.indexOf(':')) : scopeKey;
                long counselorId = Long.parseLong(counselorSegment);
                metrics = classId == null
                        ? metricsService.collectForCounselor(counselorId)
                        : metricsService.collectForCounselorClass(counselorId, classId);
            } else {
                metrics = metricsService.collectForDean();
            }
        } catch (Exception e) {
            log.warn("collect metrics failed role={} scope={}", role, scopeKey, e);
            return persist(role, scopeKey, Map.of("error", "collect_failed"),
                    List.of(), "unavailable", "error", "collect metrics failed: " + e.getMessage());
        }

        // Forward caller identity so the Python side can call backend query_* tools as this user.
        AiSidecarClient.InsightsResult result = aiClient.insights(
                role, scopeKey,
                callerUserId, role,
                TenantContext.getTenantId(),
                metrics);
        String status = result.ok() ? "ready" : "error";
        return persist(role, scopeKey, metrics, result.insights(), result.model(), status, result.errorMessage());
    }

    private WorkspaceInsight persist(String role, String scopeKey,
                                     Map<String, Object> metrics,
                                     List<Map<String, Object>> insights,
                                     String model, String status, String errorMessage) {
        WorkspaceInsight row = new WorkspaceInsight();
        row.setTenantId(TenantContext.getTenantId());
        row.setRole(role);
        row.setScopeKey(scopeKey);
        row.setGeneratedAt(OffsetDateTime.now());
        row.setExpiredAt(OffsetDateTime.now().plusHours(EXPIRY_HOURS));
        row.setModel(model);
        row.setMetrics(toJson(metrics, "{}"));
        row.setInsights(toJson(insights, "[]"));
        row.setStatus(status);
        row.setErrorMessage(errorMessage);
        insightMapper.insert(row);
        log.info("insight persisted role={} scope={} status={} model={} insights={}",
                role, scopeKey, status, model, insights.size());
        return row;
    }

    private String toJson(Object value, String fallback) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("failed to serialize insight field", e);
            return fallback;
        }
    }
}
