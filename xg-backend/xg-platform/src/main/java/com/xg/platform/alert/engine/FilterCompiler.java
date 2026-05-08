package com.xg.platform.alert.engine;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Compiles row-level filter expressions into SQL WHERE fragments + named params.
 * <p>
 * Supported subset (intentional, not full DSL):
 *   - AND-chained clauses only (no OR, NOT, parentheses)
 *   - Ops: = == != > >= < <= IN
 *   - Left side: direct columns (event_type / severity / event_source)
 *                or JSON path event_data.&lt;fieldName&gt;
 *   - Right side: number, 'string', [list literals] for IN
 * <p>
 * Unsupported filters (OR / nested paths / NOT) should be expressed by splitting into
 * multiple aggregations and combining in the rule's condition expression.
 */
@Component
public class FilterCompiler {

    private static final Set<String> DIRECT_COLUMNS = Set.of("event_type", "severity", "event_source");
    private static final List<String> LONG_OPS = List.of(">=", "<=", "!=", "==");
    private static final List<String> SHORT_OPS = List.of(">", "<", "=");

    public record Compiled(String sql, Map<String, Object> params) {}

    public Compiled compile(String filter, String paramPrefix, String tableAlias) {
        if (filter == null || filter.isBlank()) {
            return new Compiled("", Map.of());
        }
        String prefix = (tableAlias == null || tableAlias.isBlank()) ? "" : (tableAlias + ".");
        String[] clauses = filter.split("(?i)\\s+and\\s+");
        List<String> parts = new ArrayList<>();
        Map<String, Object> params = new LinkedHashMap<>();
        int idx = 0;
        for (String raw : clauses) {
            String clause = raw.trim();
            if (clause.isEmpty()) continue;
            parts.add(compileClause(clause, paramPrefix + idx, prefix, params));
            idx++;
        }
        return new Compiled(String.join(" AND ", parts), params);
    }

    private String compileClause(String clause, String paramName, String colPrefix, Map<String, Object> params) {
        int inIdx = indexOfWord(clause, "in");
        if (inIdx > 0) {
            String left = clause.substring(0, inIdx).trim();
            String right = clause.substring(inIdx + 2).trim();
            List<Object> list = parseListLiteral(right);
            params.put(paramName, list);
            String valueType = list.isEmpty() || list.get(0) instanceof String ? "string" : "number";
            return compileLeft(left, valueType, colPrefix) + " IN (:" + paramName + ")";
        }

        for (String op : LONG_OPS) {
            int i = clause.indexOf(op);
            if (i > 0) return buildComparison(clause, i, op, paramName, colPrefix, params);
        }
        for (String op : SHORT_OPS) {
            int i = clause.indexOf(op);
            if (i > 0) return buildComparison(clause, i, op, paramName, colPrefix, params);
        }
        throw new IllegalArgumentException("No operator found in filter clause: " + clause);
    }

    private String buildComparison(String clause, int opIdx, String op, String paramName, String colPrefix, Map<String, Object> params) {
        String left = clause.substring(0, opIdx).trim();
        String right = clause.substring(opIdx + op.length()).trim();
        Object value = parseLiteral(right);
        String valueType = value instanceof Number ? "number" : "string";
        params.put(paramName, value);
        String sqlOp = "==".equals(op) ? "=" : op;
        return compileLeft(left, valueType, colPrefix) + " " + sqlOp + " :" + paramName;
    }

    private String compileLeft(String left, String valueType, String colPrefix) {
        if (DIRECT_COLUMNS.contains(left)) return colPrefix + left;
        if (left.startsWith("event_data.")) {
            String path = left.substring("event_data.".length());
            if (path.contains("'") || path.contains("\"")) {
                throw new IllegalArgumentException("Invalid field path: " + left);
            }
            String extract = "(" + colPrefix + "event_data->>'" + path + "')";
            if ("number".equals(valueType)) return extract + "::numeric";
            return extract;
        }
        throw new IllegalArgumentException("Unsupported filter field: " + left);
    }

    private int indexOfWord(String s, String word) {
        String lower = s.toLowerCase();
        String target = " " + word.toLowerCase() + " ";
        return lower.indexOf(target);
    }

    private Object parseLiteral(String s) {
        if ((s.startsWith("'") && s.endsWith("'")) ||
                (s.startsWith("\"") && s.endsWith("\""))) {
            return s.substring(1, s.length() - 1);
        }
        try {
            return new BigDecimal(s);
        } catch (Exception e) {
            throw new IllegalArgumentException("Unsupported literal in filter: " + s);
        }
    }

    private List<Object> parseListLiteral(String s) {
        String t = s.trim();
        if (!t.startsWith("[") || !t.endsWith("]")) {
            throw new IllegalArgumentException("IN operand must be a [..] list, got: " + s);
        }
        String inner = t.substring(1, t.length() - 1).trim();
        if (inner.isEmpty()) return List.of();
        String[] parts = inner.split(",");
        List<Object> out = new ArrayList<>(parts.length);
        for (String p : parts) out.add(parseLiteral(p.trim()));
        return out;
    }
}
