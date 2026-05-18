package com.xg.platform.care.service;

import java.util.Map;

/**
 * 把 {@code care_task.trigger_data} 渲染成一句中文触发摘要（W1 §2.3 / §4.5）。
 *
 * <p><b>W1 §4.5 守门点</b>：前端严禁拿到 {@code rule_id}，所以摘要句必须服务端渲染。
 * {@code rule_id} 只在本类内部读，渲染结果（纯中文句）才进 {@link CareTaskView}。
 *
 * <p>措辞与 {@code CareRuleEngine.buildSummary} 及 R008/R009 内联文案保持一致 ——
 * 那边是扫描期构造（输入 RuleSpec+cnt），这里是读取期重建（输入持久化的
 * trigger_data Map），输入形态不同不强行抽共享，<b>改文案时两处同步</b>。
 */
final class CareTriggerSummary {

    private CareTriggerSummary() {}

    /** trigger_data 为空或缺关键字段时的兜底，不暴露任何内部代号 */
    private static final String FALLBACK = "有需要关注的情况";

    static String render(Map<String, Object> td) {
        if (td == null || td.isEmpty()) return FALLBACK;
        String ruleId = str(td.get("rule_id"));
        int win = asInt(td.get("window_days"));
        int matched = asInt(td.get("matched_count"));

        return switch (ruleId) {
            case "R001" -> "近 " + win + " 天该同学有 " + matched + " 次课堂缺勤";
            case "R006" -> "近 " + win + " 天有 " + matched + " 次违纪记录";
            case "R007" -> "请假已超期未销假";
            case "R011a" -> "近 " + win + " 天出现纪律类离岗";
            case "R011b" -> "近 " + win + " 天出现表现类离岗";
            case "R012" -> "近 " + win + " 天勤工申请被拒 " + matched + " 次，未成功上岗";
            case "R009" -> "近 " + win + " 天有 " + asInt(td.get("distinct_categories")) + " 类异常表现";
            case "R008" -> "近 " + win + " 天未见跟进记录";
            default -> {
                String name = str(td.get("rule_name"));
                yield name.isBlank() ? FALLBACK : name;
            }
        };
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }

    /** trigger_data 走 JSONB，数值可能是 Integer / Long / 字符串，统一容错取整 */
    private static int asInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        try {
            return o == null ? 0 : Integer.parseInt(o.toString().trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
