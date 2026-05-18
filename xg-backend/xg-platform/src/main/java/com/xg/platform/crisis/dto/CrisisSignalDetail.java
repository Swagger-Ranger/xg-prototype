package com.xg.platform.crisis.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 危机详情（设计 §4/§5，PRD §9.5）。两区物理分离、降级边界硬隔离：
 *
 * <ul>
 *   <li><b>区一·处理必须</b>（{@code studentName}…{@code handledAt}）：纯 DB，
 *       AI/规则全挂也必须渲染——辅导员靠它「找到人、核实、关闭」。</li>
 *   <li><b>区二·辅助判断</b>（{@code careHistoryCount} 起）：除 {@code brief} 外亦纯 DB；
 *       {@code brief} 是关怀侧已算好的小夕画像复用（<b>不触发新 AI</b>），缺失为 null，
 *       前端优雅降级为「暂无可用画像」，绝不影响区一与区二其余内容。</li>
 * </ul>
 *
 * <p>{@code recent*} 元素来自 {@code CrisisQueryMapper} 的原始查询，列名已 snake_case，
 * Map key 原样序列化（Jackson 命名策略不作用于 Map），与项目 SNAKE_CASE 契约一致。
 */
public record CrisisSignalDetail(
        // ── 区一 · 危机处理必须信息（纯 DB，零 AI 依赖）──
        Long signalId,
        Long studentId,
        String studentName,
        String className,
        String grade,
        String studentNo,
        String phone,
        OffsetDateTime createdAt,
        String ruleVersion,
        String status,
        String notifyStatus,
        OffsetDateTime handledAt,
        Long handledBy,

        // ── 区二 · 平时关怀信息 辅助判断 ──
        int careHistoryCount,
        List<Map<String, Object>> recentCare,
        List<Map<String, Object>> recentLeave,
        List<Map<String, Object>> recentViolation,
        /** 小夕画像（复用关怀侧已算结果）；null=暂无（AI 降级，不阻断其余）。 */
        Map<String, Object> brief) {
}
