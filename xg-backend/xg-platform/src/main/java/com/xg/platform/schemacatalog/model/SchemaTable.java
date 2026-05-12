package com.xg.platform.schemacatalog.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * 单张表在 schema-catalog yaml 里的定义。
 *
 * <p>{@code roleScope} key = 角色 code(dean / counselor / ...),value = 该角色查
 * 本表时要追加到 WHERE 的 SQL 片段(可含 :owner_college / :owner_id /
 * :counselor_classes 等占位符,由 QueryGuard 用 ExecContext 实值替换)。空串 = 不限。
 *
 * <p>{@code indexes} 列表 item 类型是 mixed:单列索引是 String,复合索引是
 * List&lt;String&gt;。这里只给 LLM 看(写 SQL 时尽量走索引),不参与 SQL 校验,所以
 * 用 List&lt;Object&gt; 接收,渲染 markdown 时按类型分支处理。
 */
public record SchemaTable(
        String table,
        String alias,
        String description,
        List<Object> indexes,
        @JsonProperty("join_keys") Map<String, Map<String, String>> joinKeys,
        List<SchemaColumn> columns,
        @JsonProperty("role_scope") Map<String, String> roleScope
) {

    /** 找列定义,找不到返回 null(调用方决定 reject 还是兜底)。 */
    public SchemaColumn findColumn(String columnName) {
        if (columns == null) return null;
        for (SchemaColumn c : columns) {
            if (c.name().equalsIgnoreCase(columnName)) return c;
        }
        return null;
    }

    /** 返回该角色查本表时的 WHERE 片段。null 角色或未注册时返回空串(=不限),
     *  fail-open 是因为 yaml 漏写一条不应该全表禁查;敏感访问由 column sensitive 兜底。 */
    public String roleScopeFor(String role) {
        if (role == null || roleScope == null) return "";
        String clause = roleScope.get(role);
        return clause == null ? "" : clause;
    }
}
