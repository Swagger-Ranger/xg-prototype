package com.xg.platform.schemacatalog.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;

/**
 * 单个列在 schema-catalog yaml 里的定义。
 *
 * <p>{@code sensitive} 是 mixed 类型:可以是 boolean(true=全脱敏 / 直接拒绝)
 * 或 string(目前只用 "pii_partial" 表示部分脱敏:手机/邮箱中间打码)。
 * 用 Object 接,{@link #sensitivityLevel()} 标准化返回三态枚举字符串。
 */
public record SchemaColumn(
        String name,
        String type,
        String label,
        List<String> aliases,
        Object sensitive,
        Boolean indexed,
        @JsonAlias("enum") List<String> enumValues
) {

    /** 三态:NONE(可暴露)/ PARTIAL(脱敏后暴露)/ FULL(QueryGuard 直接 reject SELECT)。 */
    public String sensitivityLevel() {
        if (sensitive == null) return "NONE";
        if (sensitive instanceof Boolean b) return b ? "FULL" : "NONE";
        if (sensitive instanceof String s) {
            return switch (s) {
                case "pii_partial" -> "PARTIAL";
                case "true" -> "FULL";
                case "false" -> "NONE";
                default -> "FULL";
            };
        }
        return "FULL";
    }

    public boolean isFullySensitive() {
        return "FULL".equals(sensitivityLevel());
    }
}
