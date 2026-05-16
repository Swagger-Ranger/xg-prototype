package com.xg.platform.care.service;

import java.util.List;

/**
 * 严重度序与全局偏移钳位（PRD §6.3）。纯函数，无状态 —— 单测覆盖。
 *
 * <p>序：low &lt; medium &lt; high &lt; critical。全局偏移 -1/0/+1 在此序上整体
 * 移位并钳位（+1 命中 critical 仍是 critical，-1 命中 low 仍是 low）。
 * SLA 由钳位后的 severity 派生（见 CareTaskRuleMatchService.slaHours）。
 */
public final class CareSeverity {

    private static final List<String> ORDER = List.of("low", "medium", "high", "critical");

    private CareSeverity() {}

    /**
     * 对基础 severity 施加全局偏移并钳位。
     * base 不在已知序内（理论不会，catalog 受控）则原样返回，不抛。
     */
    public static String applyOffset(String base, int offset) {
        if (base == null) {
            return null;          // List.of().indexOf(null) 会 NPE，且 null 本就该原样返回
        }
        int idx = ORDER.indexOf(base);
        if (idx < 0) {
            return base;
        }
        int shifted = Math.max(0, Math.min(ORDER.size() - 1, idx + offset));
        return ORDER.get(shifted);
    }
}
