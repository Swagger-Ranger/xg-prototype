package com.xg.platform.alert.engine;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.alert.dsl.AiHookSpec;
import com.xg.platform.alert.dsl.AlertRuleDsl;
import com.xg.platform.alert.expression.RuleConditionEvaluator;
import com.xg.platform.insight.client.AiSidecarClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Top-level entry for DSL rule evaluation.
 *   evaluate -> full match list (used by scan)
 *   preview  -> match list enriched with student name + class, capped at sampleLimit
 *
 * Condition-evaluation contract: aggregation aliases appear as top-level keys in the
 * per-student context map. compare_to aggregations additionally expose
 * alias.current / alias.previous / alias.delta / alias.pct_change for the condition
 * expression to reference.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AlertRuleEngine {

    private final AggregationExecutor aggregationExecutor;
    private final RuleConditionEvaluator conditionEvaluator;
    private final NamedParameterJdbcTemplate jdbc;
    private final AiSidecarClient aiSidecarClient;

    public List<Match> evaluate(AlertRuleDsl rule) {
        Map<Long, Map<String, Object>> perStudent = aggregationExecutor.execute(rule);
        List<Match> out = new ArrayList<>();
        for (Map.Entry<Long, Map<String, Object>> e : perStudent.entrySet()) {
            Long sid = e.getKey();
            Map<String, Object> values = e.getValue();
            try {
                if (conditionEvaluator.evaluate(rule.condition(), values)) {
                    out.add(new Match(sid, values));
                }
            } catch (Exception ex) {
                log.warn("condition eval failed for student {} rule {}: {}", sid, rule.name(), ex.getMessage());
            }
        }
        return applyAiHooks(rule, out);
    }

    /**
     * Plan B: rule-first filtering, AI post-scoring on the (already small) candidate set.
     *   target=filter   -> agent returns {keep: [id,...]} OR {drop: [id,...]}; engine keeps only keep / removes drop
     *   target=severity -> agent returns {overrides: {id: int, ...}}; engine writes `_ai_severity` into match.values
     * Hook failures are swallowed (log-only); engine degrades to pure-rule output.
     */
    private List<Match> applyAiHooks(AlertRuleDsl rule, List<Match> matches) {
        if (rule.aiHooks() == null || rule.aiHooks().isEmpty() || matches.isEmpty()) return matches;
        List<Match> current = matches;
        for (Map.Entry<String, AiHookSpec> entry : rule.aiHooks().entrySet()) {
            AiHookSpec hook = entry.getValue();
            if (hook == null || !Boolean.TRUE.equals(hook.enabled()) || hook.agent() == null) continue;

            Map<String, Object> ctx = new LinkedHashMap<>();
            ctx.put("rule_name", rule.name());
            ctx.put("condition", rule.condition());
            ctx.put("matches", current.stream().map(m -> Map.of(
                    "student_id", m.studentId(),
                    "values", m.values()
            )).toList());
            AiSidecarClient.AgentResult res = aiSidecarClient.invokeAgent(
                    hook.agent(), ctx, hook.params(), UUID.randomUUID().toString());
            if (!res.ok()) {
                log.warn("ai hook {} failed: {} — keeping rule-only matches", entry.getKey(), res.errorMessage());
                continue;
            }
            current = switch (hook.target() == null ? "" : hook.target()) {
                case "filter"   -> applyFilterHook(current, res.output());
                case "severity" -> applySeverityHook(current, res.output());
                default -> current;
            };
        }
        return current;
    }

    @SuppressWarnings("unchecked")
    private List<Match> applyFilterHook(List<Match> in, Map<String, Object> out) {
        Object keep = out.get("keep");
        Object drop = out.get("drop");
        if (keep instanceof Collection<?> k) {
            Set<Long> ids = new HashSet<>();
            for (Object o : k) ids.add(toLong(o));
            return in.stream().filter(m -> ids.contains(m.studentId())).toList();
        }
        if (drop instanceof Collection<?> d) {
            Set<Long> ids = new HashSet<>();
            for (Object o : d) ids.add(toLong(o));
            return in.stream().filter(m -> !ids.contains(m.studentId())).toList();
        }
        return in;
    }

    @SuppressWarnings("unchecked")
    private List<Match> applySeverityHook(List<Match> in, Map<String, Object> out) {
        Object ov = out.get("overrides");
        if (!(ov instanceof Map<?, ?> raw)) return in;
        Map<Long, Integer> overrides = new java.util.HashMap<>();
        for (Map.Entry<?, ?> e : raw.entrySet()) {
            Long sid = toLong(e.getKey());
            Integer sev = toInt(e.getValue());
            if (sid != null && sev != null) overrides.put(sid, sev);
        }
        List<Match> result = new ArrayList<>(in.size());
        for (Match m : in) {
            Integer s = overrides.get(m.studentId());
            if (s == null) { result.add(m); continue; }
            Map<String, Object> v = new LinkedHashMap<>(m.values());
            v.put("_ai_severity", s);
            result.add(new Match(m.studentId(), v));
        }
        return result;
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return null; }
    }

    private static Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return null; }
    }

    private static final java.util.regex.Pattern VALID_SCHEMA =
            java.util.regex.Pattern.compile("^[a-zA-Z0-9_]{1,64}$");

    @Transactional(readOnly = true)
    public PreviewResult preview(AlertRuleDsl rule, int sampleLimit) {
        String schema = TenantContext.getSchemaName();
        if (schema != null && !schema.equals("public") && VALID_SCHEMA.matcher(schema).matches()) {
            jdbc.getJdbcOperations().execute("SET search_path TO " + schema + ", public");
        }
        List<Match> matches = evaluate(rule);
        int cap = Math.max(1, Math.min(sampleLimit, 100));
        List<Match> head = matches.size() > cap ? matches.subList(0, cap) : matches;

        Map<Long, StudentMeta> metaById = loadStudentMeta(head.stream().map(Match::studentId).toList());
        List<Sample> samples = new ArrayList<>(head.size());
        for (Match m : head) {
            StudentMeta meta = metaById.getOrDefault(m.studentId(), new StudentMeta(null, null));
            samples.add(new Sample(m.studentId(), meta.name(), meta.className(), m.values()));
        }
        return new PreviewResult(rule.name(), matches.size(), samples);
    }

    private Map<Long, StudentMeta> loadStudentMeta(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        String sql = """
                SELECT p.user_id AS id,
                       COALESCE(u.real_name, u.username) AS name,
                       o.name AS class_name
                FROM student_profile p
                LEFT JOIN sys_user u ON u.id = p.user_id
                LEFT JOIN org_unit o ON o.id = p.class_id
                WHERE p.user_id IN (:ids)
                """;
        MapSqlParameterSource params = new MapSqlParameterSource();
        params.addValue("ids", Set.copyOf(ids));
        return jdbc.query(sql, params, rs -> {
            Map<Long, StudentMeta> m = new LinkedHashMap<>();
            while (rs.next()) {
                m.put(rs.getLong("id"), new StudentMeta(rs.getString("name"), rs.getString("class_name")));
            }
            return m;
        });
    }

    public record Match(Long studentId, Map<String, Object> values) {}
    public record Sample(Long studentId, String studentName, String className, Map<String, Object> values) {}
    public record PreviewResult(String ruleName, int totalMatched, List<Sample> samples) {}
    private record StudentMeta(String name, String className) {}
}
