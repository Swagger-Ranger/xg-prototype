package com.xg.platform.care.rule;

import java.util.List;

/**
 * 内置规则配置。规则是产品方维护的代码，不入库（PRD §9.1）。
 *
 * @param ruleId       R001 等代号
 * @param name         中文名（进 trigger_data，不暴露 ruleId 给用户）
 * @param category     学业 / 行为 / 生活 / 跨类 / 勤工
 * @param severity     critical / high / medium / low（SLA 由此派生，见 CareScanService）
 * @param cooldownDays 同一 (student, rule) 冷却天数，防重复刷任务
 * @param evalKind     评估方式
 * @param eventTypes   COUNT_THRESHOLD / MULTI_CATEGORY 关心的事件 code
 * @param minCount     阈值（次数 / 类别数）
 * @param windowDays   回溯窗口天数
 * @param severityMin  事件 severity 下界过滤（含），null 表示不过滤 —— R011a/R011b 按离岗严重度分流
 * @param severityMax  事件 severity 上界过滤（含），null 表示不过滤
 */
public record RuleSpec(
        String ruleId,
        String name,
        String category,
        String severity,
        int cooldownDays,
        EvalKind evalKind,
        List<String> eventTypes,
        int minCount,
        int windowDays,
        Integer severityMin,
        Integer severityMax
) {
    public enum EvalKind {
        /** 窗口内某类事件计数 >= minCount（可叠加 severity 区间过滤） */
        COUNT_THRESHOLD,
        /** 窗口内 >= minCount 个不同事件来源类别（R009 多模块异常） */
        MULTI_CATEGORY,
        /** 有历史关怀任务 且 窗口内无谈话记录（R008 长期无跟进） */
        NO_FOLLOWUP_WITH_HISTORY
    }
}
