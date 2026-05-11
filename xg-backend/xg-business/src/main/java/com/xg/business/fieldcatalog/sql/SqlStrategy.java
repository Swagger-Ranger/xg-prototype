package com.xg.business.fieldcatalog.sql;

import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;

/**
 * 一种取数策略。fragment() 返回 SQL 片段(含 MyBatis #{paramRef} 占位符),
 * 由 {@link SqlBuilder} 拼到 WHERE 子句中。具体的值绑定由 MyBatis 走 @Param 完成,
 * 这里不直接处理参数,避免 SQL 注入风险。
 *
 * 列名 / 类型枚举值 来自 yaml(可信),但实现里仍要做白名单/正则校验,
 * 防止有人改 yaml 时手抖留下注入面。
 */
public interface SqlStrategy {
    String name();
    String fragment(FieldDef field, String paramRef);
}
