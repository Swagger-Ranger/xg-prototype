package com.xg.platform.workflow.expression;

import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Map;

/**
 * Evaluates restricted workflow expressions against context variables.
 *
 * Supported operators: ==, !=, >=, <=, >, <, in, and, or
 * Supported built-in functions (resolved externally before passing expression):
 *   duration_days(start, end), date_diff(d1, d2, unit), if_then(cond, v1, v2)
 *
 * Examples:
 *   "duration_days >= 3"
 *   "leave_type == 'sick_leave'"
 *   "duration_days >= 3 and leave_type != 'official'"
 */
@Component
public class ExpressionEvaluator {

    private static final String[] OPERATORS = {">=", "<=", "!=", "==", ">", "<", " in "};

    public boolean evaluate(String expression, Map<String, Object> context) {
        if (expression == null || expression.isBlank()) return true;

        if (expression.contains(" or ")) {
            String[] parts = expression.split("\\s+or\\s+");
            return Arrays.stream(parts).anyMatch(p -> evaluate(p.trim(), context));
        }
        if (expression.contains(" and ")) {
            String[] parts = expression.split("\\s+and\\s+");
            return Arrays.stream(parts).allMatch(p -> evaluate(p.trim(), context));
        }

        return evaluateSingle(expression, context);
    }

    private boolean evaluateSingle(String expr, Map<String, Object> context) {
        for (String op : OPERATORS) {
            int idx = expr.indexOf(op);
            if (idx > 0) {
                String left = expr.substring(0, idx).trim();
                String right = expr.substring(idx + op.length()).trim();
                Object leftVal = resolveValue(left, context);
                Object rightVal = resolveValue(right, context);
                return compare(leftVal, rightVal, op.trim());
            }
        }

        // Bare variable name - treat as boolean
        Object val = context.get(expr);
        return val != null && !"false".equals(val.toString()) && !"0".equals(val.toString());
    }

    private Object resolveValue(String token, Map<String, Object> context) {
        if ((token.startsWith("'") && token.endsWith("'")) ||
                (token.startsWith("\"") && token.endsWith("\""))) {
            return token.substring(1, token.length() - 1);
        }
        try {
            return new java.math.BigDecimal(token);
        } catch (NumberFormatException ignored) {
        }
        return context.get(token);
    }

    private boolean compare(Object left, Object right, String op) {
        if (left == null || right == null) return false;

        switch (op) {
            case "==":
                return left.toString().equals(right.toString());
            case "!=":
                return !left.toString().equals(right.toString());
            case "in": {
                String rightStr = right.toString();
                if (rightStr.startsWith("[")) {
                    rightStr = rightStr.substring(1, rightStr.length() - 1);
                }
                return Arrays.stream(rightStr.split(","))
                        .map(String::trim)
                        .map(s -> s.replaceAll("^['\"]|['\"]$", ""))
                        .anyMatch(s -> s.equals(left.toString()));
            }
            default: {
                try {
                    double l = Double.parseDouble(left.toString());
                    double r = Double.parseDouble(right.toString());
                    return switch (op) {
                        case ">=" -> l >= r;
                        case "<=" -> l <= r;
                        case ">" -> l > r;
                        case "<" -> l < r;
                        default -> false;
                    };
                } catch (NumberFormatException e) {
                    return false;
                }
            }
        }
    }
}
