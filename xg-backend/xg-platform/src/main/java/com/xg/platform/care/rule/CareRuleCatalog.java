package com.xg.platform.care.rule;

import java.util.List;
import java.util.Optional;

import static com.xg.platform.care.rule.RuleSpec.EvalKind.COUNT_THRESHOLD;
import static com.xg.platform.care.rule.RuleSpec.EvalKind.MULTI_CATEGORY;
import static com.xg.platform.care.rule.RuleSpec.EvalKind.NO_FOLLOWUP_WITH_HISTORY;

/**
 * P1 内置规则集（产品方维护，版本化发布）。
 *
 * <p><b>本版只含有真实数据流的 8 条</b>。PRD §9.2 的 13 条里：
 * <ul>
 *   <li>R002/R003/R010 —— 系统无成绩库，P1 不可行（见 docs/W2-规则埋点backlog.md）</li>
 *   <li>R004/R005 —— 缺宿舍查寝子系统，待数据源确认</li>
 * </ul>
 * 这 5 条不写进 catalog（写了也永不触发 = 死代码）；rule_id 在 backlog 文档保留登记。
 *
 * <p>SLA 不在此配置：由 severity 按 PRD §9.3 统一派生（critical=24h / high=48h /
 * medium=7d / low=14d），见 {@code CareScanService}。
 */
public final class CareRuleCatalog {

    /** 规则集版本：升级规则逻辑 / 阈值时 +1，写进 care_task.rule_version 供老任务追溯。 */
    public static final String RULE_VERSION = "p1-2026.05";

    private CareRuleCatalog() {}

    public static final List<RuleSpec> RULES = List.of(
            new RuleSpec("R001", "连续缺课", "学业", "critical", 7,
                    COUNT_THRESHOLD, List.of("checkin_absent"), 3, 5, null, null),

            new RuleSpec("R006", "重复违纪", "行为", "critical", 14,
                    COUNT_THRESHOLD, List.of("violation_recorded", "violation_approved"), 2, 30, null, null),

            new RuleSpec("R007", "请假超期", "生活", "high", 3,
                    COUNT_THRESHOLD, List.of("leave_overdue"), 1, 3, null, null),

            new RuleSpec("R008", "长期无跟进", "生活", "low", 30,
                    NO_FOLLOWUP_WITH_HISTORY, List.of("counselor_talk_recorded"), 1, 60, null, null),

            new RuleSpec("R009", "多模块异常", "跨类", "critical", 14,
                    MULTI_CATEGORY, List.of(), 3, 30, 4, null),

            // R011 按离岗严重度分流：discipline 派生 severity=7（紧急），performance/other 派生 5（关注）
            new RuleSpec("R011a", "勤工履职异常（纪律）", "勤工", "critical", 14,
                    COUNT_THRESHOLD, List.of("workstudy_offboarded"), 1, 30, 7, 10),

            new RuleSpec("R011b", "勤工履职异常（表现）", "勤工", "medium", 30,
                    COUNT_THRESHOLD, List.of("workstudy_offboarded"), 1, 30, 4, 6),

            // R012 "无成功上岗"无对应事件，P1 近似为"30 天内被拒 >=3 次"，
            // 待补 workstudy_onboarded 事件后再加 AND NOT EXISTS 过滤（backlog 已登记）
            new RuleSpec("R012", "隐性经济压力", "勤工", "medium", 30,
                    COUNT_THRESHOLD, List.of("workstudy_apply_rejected"), 3, 30, null, null)
    );

    /** 按 ruleId 查规则配置 —— 关闭任务时回算 cooldown_until 用。 */
    public static Optional<RuleSpec> findById(String ruleId) {
        return RULES.stream().filter(r -> r.ruleId().equals(ruleId)).findFirst();
    }
}
