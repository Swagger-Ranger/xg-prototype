package com.xg.platform.alert.engine;

import com.xg.platform.alert.catalog.AlertDimension;
import com.xg.platform.alert.dsl.AggregationSpec;
import com.xg.platform.alert.dsl.AlertRuleDsl;
import com.xg.platform.alert.dsl.ScopeSpec;
import com.xg.platform.alert.dsl.WindowSpec;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Evaluates all aggregations of a rule against student_event_log and returns
 * a per-student value map that feeds the condition evaluator.
 * <p>
 * Output shape:
 *   Map<studentId, Map<aliasPath, value>>
 *     - aliasPath = alias for the aggregated value, or alias.current /
 *       alias.previous / alias.delta / alias.pct_change when compareTo is set
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AggregationExecutor {

    private final NamedParameterJdbcTemplate jdbc;
    private final FilterCompiler filterCompiler;

    public Map<Long, Map<String, Object>> execute(AlertRuleDsl rule) {
        OffsetDateTime[] bounds = resolveWindow(rule.window());
        Map<Long, Map<String, Object>> merged = new HashMap<>();

        for (Map.Entry<String, AggregationSpec> entry : rule.aggregations().entrySet()) {
            String alias = entry.getKey();
            AggregationSpec agg = entry.getValue();
            AlertDimension dim = AlertDimension.fromCode(agg.dimension());
            Set<String> eventCodes = dim.eventTypes().stream()
                    .map(StudentEventType::code)
                    .collect(Collectors.toUnmodifiableSet());

            Map<Long, Object> current = runAggregation(agg, eventCodes, bounds[0], bounds[1], rule.scope(), alias + "_c");

            if (agg.compareTo() != null) {
                OffsetDateTime[] prev = resolveCompareWindow(bounds, rule.window(), agg.compareTo());
                Map<Long, Object> previous = runAggregation(agg, eventCodes, prev[0], prev[1], rule.scope(), alias + "_p");
                Set<Long> ids = new HashSet<>(current.keySet());
                ids.addAll(previous.keySet());
                for (Long sid : ids) {
                    double curr = toDouble(current.get(sid));
                    double prv = toDouble(previous.get(sid));
                    double delta = curr - prv;
                    Double pct = prv == 0.0 ? null : (curr - prv) / Math.abs(prv);
                    Map<String, Object> m = merged.computeIfAbsent(sid, k -> new HashMap<>());
                    m.put(alias, curr);
                    m.put(alias + ".current", curr);
                    m.put(alias + ".previous", prv);
                    m.put(alias + ".delta", delta);
                    m.put(alias + ".pct_change", pct);
                }
            } else {
                for (Map.Entry<Long, Object> e : current.entrySet()) {
                    merged.computeIfAbsent(e.getKey(), k -> new HashMap<>())
                            .put(alias, e.getValue());
                }
            }
        }

        return merged;
    }

    private Map<Long, Object> runAggregation(AggregationSpec agg, Set<String> eventCodes,
                                              OffsetDateTime start, OffsetDateTime end,
                                              ScopeSpec scope, String paramPrefix) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        params.addValue("types", eventCodes);
        params.addValue("start", start);
        params.addValue("end", end);

        FilterCompiler.Compiled compiledFilter = filterCompiler.compile(agg.filter(), paramPrefix + "_f", "e");
        params.addValues(compiledFilter.params());
        String filterClause = compiledFilter.sql().isEmpty() ? "" : " AND " + compiledFilter.sql();

        ScopeClause scopeClause = buildScopeClause(scope);
        params.addValues(scopeClause.params);

        String sql = buildSql(agg, filterClause, scopeClause.clause);
        log.debug("agg sql for {}: {}", agg.op(), sql);

        return jdbc.query(sql, params, rs -> {
            Map<Long, Object> out = new LinkedHashMap<>();
            while (rs.next()) {
                long sid = rs.getLong("student_id");
                Object val = rs.getObject("v");
                out.put(sid, val);
            }
            return out;
        });
    }

    private String buildSql(AggregationSpec agg, String filterClause, String scopeJoin) {
        String op = agg.op();
        String base = """
                FROM student_event_log e%s
                WHERE e.event_type IN (:types)
                  AND e.occurred_at >= :start AND e.occurred_at < :end
                """.formatted(scopeJoin) + filterClause;

        return switch (op) {
            case "count" -> "SELECT e.student_id AS student_id, COUNT(*) AS v " + base + " GROUP BY e.student_id";
            case "sum"  -> "SELECT e.student_id AS student_id, SUM(" + jsonNumericPath(agg.field()) + ") AS v " + base + " GROUP BY e.student_id";
            case "avg"  -> "SELECT e.student_id AS student_id, AVG(" + jsonNumericPath(agg.field()) + ") AS v " + base + " GROUP BY e.student_id";
            case "max"  -> "SELECT e.student_id AS student_id, MAX(" + jsonNumericPath(agg.field()) + ") AS v " + base + " GROUP BY e.student_id";
            case "min"  -> "SELECT e.student_id AS student_id, MIN(" + jsonNumericPath(agg.field()) + ") AS v " + base + " GROUP BY e.student_id";
            case "distinct_days" -> "SELECT e.student_id AS student_id, COUNT(DISTINCT DATE(e.occurred_at)) AS v " + base + " GROUP BY e.student_id";
            case "exists" -> "SELECT e.student_id AS student_id, 1 AS v " + base + " GROUP BY e.student_id";
            case "consecutive_days" -> """
                    WITH daily AS (
                      SELECT e.student_id, DATE(e.occurred_at) AS d
                      %s
                      GROUP BY e.student_id, DATE(e.occurred_at)
                    ),
                    streaks AS (
                      SELECT student_id, d,
                             (d::date - (ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY d))::integer) AS grp
                      FROM daily
                    ),
                    lens AS (
                      SELECT student_id, grp, COUNT(*) AS cnt FROM streaks GROUP BY student_id, grp
                    )
                    SELECT student_id, MAX(cnt) AS v FROM lens GROUP BY student_id
                    """.formatted(base);
            default -> throw new IllegalArgumentException("Unsupported op: " + op);
        };
    }

    private String jsonNumericPath(String field) {
        if (field == null || !field.startsWith("event_data.")) {
            throw new IllegalArgumentException("Op requires event_data.<path>, got: " + field);
        }
        String path = field.substring("event_data.".length());
        return "(e.event_data->>'" + path + "')::numeric";
    }

    private ScopeClause buildScopeClause(ScopeSpec scope) {
        Map<String, Object> p = new LinkedHashMap<>();
        StringBuilder join = new StringBuilder(" JOIN student_profile p ON p.user_id = e.student_id");
        if (scope != null) {
            List<String> filters = new java.util.ArrayList<>();
            if (scope.grade() != null && !scope.grade().isEmpty()) {
                filters.add("p.grade IN (:scope_grades)");
                p.put("scope_grades", scope.grade());
            }
            if (scope.classId() != null && !scope.classId().isEmpty()) {
                filters.add("p.class_id IN (:scope_classes)");
                p.put("scope_classes", scope.classId());
            }
            if (!filters.isEmpty()) {
                join.append(" AND ").append(String.join(" AND ", filters));
            }
        }
        return new ScopeClause(join.toString(), p);
    }

    private OffsetDateTime[] resolveWindow(WindowSpec window) {
        OffsetDateTime now = OffsetDateTime.now();
        return switch (window.type()) {
            case "rolling" -> {
                int days = window.days() == null ? 30 : window.days();
                yield new OffsetDateTime[]{now.minusDays(days), now};
            }
            case "calendar_month" -> {
                OffsetDateTime start = now.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
                yield new OffsetDateTime[]{start, start.plusMonths(1)};
            }
            case "calendar_week" -> {
                OffsetDateTime start = now.with(DayOfWeek.MONDAY).truncatedTo(ChronoUnit.DAYS);
                yield new OffsetDateTime[]{start, start.plusWeeks(1)};
            }
            case "semester" -> throw new UnsupportedOperationException("semester window not yet supported (P0)");
            default -> throw new IllegalArgumentException("Unknown window type: " + window.type());
        };
    }

    private OffsetDateTime[] resolveCompareWindow(OffsetDateTime[] current, WindowSpec window, String compareTo) {
        return switch (compareTo) {
            case "previous_period" -> {
                long secs = current[1].toEpochSecond() - current[0].toEpochSecond();
                OffsetDateTime end = current[0];
                OffsetDateTime start = end.minusSeconds(secs);
                yield new OffsetDateTime[]{start, end};
            }
            case "previous_month" -> {
                OffsetDateTime base = current[0].atZoneSameInstant(ZoneOffset.UTC).toOffsetDateTime();
                OffsetDateTime start = base.minusMonths(1);
                yield new OffsetDateTime[]{start, base};
            }
            case "previous_week" -> {
                OffsetDateTime base = current[0];
                yield new OffsetDateTime[]{base.minusWeeks(1), base};
            }
            default -> throw new IllegalArgumentException("Unknown compareTo: " + compareTo);
        };
    }

    private static double toDouble(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(o.toString()); }
        catch (Exception e) { return 0.0; }
    }

    private record ScopeClause(String clause, Map<String, Object> params) {}
}
