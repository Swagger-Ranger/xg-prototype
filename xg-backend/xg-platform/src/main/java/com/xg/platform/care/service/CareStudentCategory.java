package com.xg.platform.care.service;

/**
 * 学生侧只读摘要的类型映射与文案（PRD §13.3）。纯函数，单测覆盖。
 *
 * <p>合规要点：学生端只能见 PRD §13.3 钦定的 4 个桶（学业 / 行为 / 生活 /
 * 勤工助学），<b>不</b>暴露内部规则分类术语、规则名、严重度、证据。
 * 内部分类 "跨类"（R009 多模块异常）不在 4 桶白名单内 —— 折叠进 "生活"，
 * 避免学生看到 "跨类" 这种内部分类词。这是产品/合规取舍，改桶须先过合规走查。
 */
public final class CareStudentCategory {

    public static final String EMPTY_MESSAGE = "目前无主动关心记录";

    private CareStudentCategory() {}

    /** 内部规则分类 → 学生侧白名单桶。未知一律落 "生活"（最温和、最泛）。 */
    public static String label(String ruleCategory) {
        return switch (ruleCategory == null ? "" : ruleCategory) {
            case "学业" -> "学业";
            case "行为" -> "行为";
            case "勤工" -> "勤工助学";
            case "生活", "跨类" -> "生活";
            default -> "生活";
        };
    }

    /** 单桶文案（PRD §13.3 钦定句式，不含分数 / 排名 / 老师姓名 / 规则名）。 */
    public static String message(String label, int count) {
        return "你当前有 " + count + " 项" + label + "类的主动关心，老师可能近期联系你";
    }
}
