package com.xg.platform.insight.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * HTTP client for the Python AI sidecar's insight endpoint.
 *
 * Returns an {@link InsightsResult} even on failure — the caller persists
 * {@code error_message} and degrades the UI rather than aborting the scheduled scan.
 */
@Slf4j
@Component
public class AiSidecarClient {

    private final RestTemplate restTemplate;
    /** Author-style agents (free-form NL → JSON DSL) typically take 30-90s
     * because they call DeepSeek + run JSON-schema validation + retry. The
     * default sidecar timeout is too short for them. */
    private final RestTemplate authorRestTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    /** 跟 sidecar settings.internal_token 对齐;Java→sidecar 所有调用都带这个 header,
     *  sidecar 端拒绝缺失或不匹配的请求(deps.verify_internal_token)。 */
    private final String internalToken;

    private static final java.util.Set<String> AUTHOR_AGENTS = java.util.Set.of(
            "workflow_author", "alert_rule_author");

    public AiSidecarClient(ObjectMapper objectMapper,
                           @Value("${ai.sidecar.base-url:http://localhost:8000}") String baseUrl,
                           @Value("${ai.sidecar.timeout:15000}") int timeoutMs,
                           @Value("${ai.sidecar.author-timeout:180000}") int authorTimeoutMs,
                           @Value("${ai.sidecar.internal-token:dev-internal-token}") String internalToken) {
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.restTemplate = buildTemplate(timeoutMs);
        this.authorRestTemplate = buildTemplate(authorTimeoutMs);
        this.internalToken = internalToken;
    }

    /** 给所有 Java→sidecar 调用统一加 Content-Type + X-Internal-Token。 */
    private HttpHeaders internalHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (internalToken != null && !internalToken.isBlank()) {
            h.set("X-Internal-Token", internalToken);
        }
        return h;
    }

    private static RestTemplate buildTemplate(int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(readTimeoutMs);
        return new RestTemplate(factory);
    }

    public InsightsResult insights(String role, String scopeKey,
                                   String userId, String userRole,
                                   String tenantId,
                                   Map<String, Object> metrics) {
        String url = baseUrl + "/api/v1/insights";
        Map<String, Object> body = Map.of(
                "role", role,
                "scope_key", scopeKey == null ? "global" : scopeKey,
                "user_id", userId == null ? "0" : userId,
                "user_role", userRole == null ? role : userRole,
                "tenant_id", tenantId == null ? "default" : tenantId,
                "metrics", metrics == null ? Map.of() : metrics
        );
        HttpHeaders headers = internalHeaders();
        try {
            org.springframework.http.HttpEntity<Map<String, Object>> req = new org.springframework.http.HttpEntity<>(body, headers);
            Map<String, Object> resp = restTemplate.postForObject(url, req, Map.class);
            if (resp == null) {
                return InsightsResult.failure("sidecar returned null");
            }
            String model = (String) resp.getOrDefault("model", "unknown");
            String errorMessage = (String) resp.get("error_message");
            List<Map<String, Object>> insights = objectMapper.convertValue(
                    resp.getOrDefault("insights", List.of()),
                    new TypeReference<>() {});
            return new InsightsResult(model, insights, errorMessage);
        } catch (Exception e) {
            log.warn("ai sidecar insights call failed role={} scope={}", role, scopeKey, e);
            return InsightsResult.failure("sidecar error: " + e.getMessage());
        }
    }

    public record InsightsResult(String model, List<Map<String, Object>> insights, String errorMessage) {
        public static InsightsResult failure(String msg) {
            return new InsightsResult("unavailable", List.of(), msg);
        }
        public boolean ok() {
            return errorMessage == null;
        }
    }

    /**
     * Generic LangGraph agent invocation. Used by alert ai_hooks and any other
     * component that needs to hand a named Sidecar agent a context dict.
     * Never throws — callers fall back to the non-AI path on errorMessage.
     */
    public AgentResult invokeAgent(String agent, Map<String, Object> context, Map<String, Object> params, String traceId) {
        String url = baseUrl + "/api/v1/agent/invoke";
        java.util.LinkedHashMap<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("agent", agent);
        body.put("context", context == null ? Map.of() : context);
        body.put("params", params == null ? Map.of() : params);
        if (traceId != null) body.put("trace_id", traceId);
        HttpHeaders headers = internalHeaders();
        RestTemplate client = AUTHOR_AGENTS.contains(agent) ? authorRestTemplate : restTemplate;
        try {
            org.springframework.http.HttpEntity<Map<String, Object>> req = new org.springframework.http.HttpEntity<>(body, headers);
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = client.postForObject(url, req, Map.class);
            if (resp == null) return AgentResult.failure("sidecar returned null");
            String errorMessage = (String) resp.get("error_message");
            @SuppressWarnings("unchecked")
            Map<String, Object> output = (Map<String, Object>) resp.getOrDefault("output", Map.of());
            return new AgentResult(agent, output, errorMessage);
        } catch (Exception e) {
            log.warn("ai sidecar agent invoke failed agent={}", agent, e);
            return AgentResult.failure("sidecar error: " + e.getMessage());
        }
    }

    public record AgentResult(String agent, Map<String, Object> output, String errorMessage) {
        public static AgentResult failure(String msg) {
            return new AgentResult("unavailable", Map.of(), msg);
        }
        public boolean ok() {
            return errorMessage == null;
        }
    }

    /**
     * 把"驳回原因草稿"送给 sidecar 的 polish 端点改写成给学生看的版本。
     * 失败时回退到原文，不抛异常 — 调用方拿不到 polish 也能继续走人工提交。
     */
    public PolishResult polishRejection(String draft, String context) {
        String url = baseUrl + "/api/v1/polish/rejection";
        java.util.LinkedHashMap<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("draft", draft == null ? "" : draft);
        if (context != null && !context.isBlank()) body.put("context", context);
        HttpHeaders headers = internalHeaders();
        try {
            org.springframework.http.HttpEntity<Map<String, Object>> req =
                    new org.springframework.http.HttpEntity<>(body, headers);
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restTemplate.postForObject(url, req, Map.class);
            if (resp == null) return new PolishResult(draft, "unavailable", "sidecar returned null");
            String polished = (String) resp.getOrDefault("polished", draft);
            String model = (String) resp.getOrDefault("model", "unknown");
            String errorMessage = (String) resp.get("error_message");
            return new PolishResult(polished, model, errorMessage);
        } catch (Exception e) {
            log.warn("ai sidecar polish-rejection failed", e);
            return new PolishResult(draft, "unavailable", "sidecar error: " + e.getMessage());
        }
    }

    public record PolishResult(String polished, String model, String errorMessage) {
        public boolean ok() { return errorMessage == null; }
    }

    /**
     * 让 sidecar 为每个推荐岗位写一段 1-2 句的友好理由。
     * Sidecar 失败时返回 null（调用方降级为不展示理由文本）。
     *
     * @param student   学生 brief：{name, aid_level, grade, college, preference}
     * @param positions 每条 position brief：{position_id, title, salary_*, signals, score}
     * @return position_id → 理由文本；失败 / 缺项时为 null 或缺 key
     */
    public Map<Long, String> writeRecommendationReasons(
            Map<String, Object> student, List<Map<String, Object>> positions) {
        String url = baseUrl + "/api/v1/workstudy/write-recommendation-reasons";
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("student", student == null ? Map.of() : student);
        body.put("positions", positions == null ? List.of() : positions);
        HttpHeaders headers = internalHeaders();
        try {
            org.springframework.http.HttpEntity<Map<String, Object>> req =
                    new org.springframework.http.HttpEntity<>(body, headers);
            // 走 authorRestTemplate(180s) 而非默认 15s:LLM 多岗位逐条出理由 + JSON 解析常超 15s,
            // 用短超时会频繁触发降级,反而看不到 AI 理由。
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = authorRestTemplate.postForObject(url, req, Map.class);
            if (resp == null) return null;
            Object reasons = resp.get("reasons");
            if (!(reasons instanceof Map<?, ?> map)) return null;
            Map<Long, String> out = new java.util.HashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                Long id;
                try { id = Long.parseLong(e.getKey().toString()); }
                catch (NumberFormatException nfe) { continue; }
                if (e.getValue() instanceof String s) out.put(id, s);
            }
            return out;
        } catch (Exception e) {
            log.warn("ai sidecar write-recommendation-reasons failed", e);
            return null;
        }
    }

    /**
     * Per-task AI recommendation. Expects caller to pre-pack the enriched context
     * into {@code context}; the sidecar echoes a stable dict back.
     */
    public Map<String, Object> taskRecommendation(Map<String, Object> context) {
        String url = baseUrl + "/api/v1/task-recommendation";
        HttpHeaders headers = internalHeaders();
        try {
            org.springframework.http.HttpEntity<Map<String, Object>> req =
                    new org.springframework.http.HttpEntity<>(context, headers);
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restTemplate.postForObject(url, req, Map.class);
            if (resp == null) {
                return Map.of("error_message", "sidecar returned null");
            }
            return resp;
        } catch (Exception e) {
            log.warn("ai sidecar task-recommendation failed", e);
            return Map.of("error_message", "sidecar error: " + e.getMessage());
        }
    }
}
