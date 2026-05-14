package com.xg.business.dataimport.schema;

import java.util.List;

/**
 * 系统侧"导入目标字段"的元数据。每个场景一张表，前端展示用 label / required / category，
 * 启发式匹配靠 aliases 命中。aliases 写中文常见叫法 + 学校 Excel 里见过的列名变体。
 */
public record TargetField(
        /** 内部字段名（落库时用），如 "student_no" */
        String key,
        /** 中文 label（前端显示给用户的"要导入到"），如 "学号" */
        String label,
        /** 是否必填 */
        boolean required,
        /** 用户表里可能见到的列名 / 同义词，用于启发式匹配 */
        List<String> aliases,
        /** UI 分组用："基础" / "组织" / "联系" / "学籍"，可空 */
        String category
) {
    public TargetField(String key, String label, boolean required, List<String> aliases) {
        this(key, label, required, aliases, null);
    }
}
