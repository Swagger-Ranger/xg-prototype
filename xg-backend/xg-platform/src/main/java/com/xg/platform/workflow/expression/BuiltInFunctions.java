package com.xg.platform.workflow.expression;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Component
public class BuiltInFunctions {

    /**
     * Calculate days between two timestamps (rounded up to 0.5 day).
     */
    public static BigDecimal durationDays(LocalDateTime start, LocalDateTime end) {
        long hours = java.time.Duration.between(start, end).toHours();
        double days = hours / 24.0;
        return BigDecimal.valueOf(Math.ceil(days * 2) / 2.0);
    }

    /**
     * Calculate difference between two dates in specified unit.
     */
    public static long dateDiff(LocalDateTime d1, LocalDateTime d2, String unit) {
        java.time.Duration duration = java.time.Duration.between(d1, d2).abs();
        return switch (unit) {
            case "days" -> duration.toDays();
            case "hours" -> duration.toHours();
            case "minutes" -> duration.toMinutes();
            default -> duration.toDays();
        };
    }

    /**
     * Ternary expression.
     */
    public static Object ifThen(boolean condition, Object trueVal, Object falseVal) {
        return condition ? trueVal : falseVal;
    }
}
