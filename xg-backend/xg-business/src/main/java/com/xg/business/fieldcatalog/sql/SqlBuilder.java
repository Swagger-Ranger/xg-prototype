package com.xg.business.fieldcatalog.sql;

import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把"页面字段定义 + 调用方传进来的原始过滤值"翻译成 (WHERE 片段, 绑定参数 Map)。
 * Mapper 拼到 base SQL 后面,值通过 MyBatis #{} 安全绑定。
 *
 * 使用方式:
 *   <pre>
 *   Built b = sqlBuilder.build(catalog.fields(), Map.of("gender","male", "academy","博雅书院"));
 *   String sql = "SELECT ... FROM ... WHERE sp.deleted_at IS NULL " + b.where() + " ORDER BY ...";
 *   </pre>
 */
@Component
public class SqlBuilder {

    /** paramRef 前缀:对应 mapper @Param("filters") 注入的 Map。 */
    private static final String PARAM_PREFIX = "filters.";

    private final Map<String, SqlStrategy> strategiesByName;

    public SqlBuilder(List<SqlStrategy> strategies) {
        Map<String, SqlStrategy> map = new HashMap<>();
        for (SqlStrategy s : strategies) {
            if (map.put(s.name(), s) != null) {
                throw new IllegalStateException("重复 SqlStrategy:" + s.name());
            }
        }
        this.strategiesByName = Map.copyOf(map);
    }

    public Built build(List<FieldDef> fields, Map<String, Object> rawParams) {
        StringBuilder where = new StringBuilder();
        Map<String, Object> bind = new LinkedHashMap<>();
        for (FieldDef field : fields) {
            Object value = rawParams.get(field.key());
            if (isBlank(value)) continue;
            SqlStrategy strategy = strategiesByName.get(field.sql().strategy());
            if (strategy == null) {
                throw new IllegalStateException("未知 strategy:" + field.sql().strategy()
                        + " (field=" + field.key() + ")");
            }
            where.append(" AND ").append(strategy.fragment(field, PARAM_PREFIX + field.key()));
            bind.put(field.key(), value);
        }
        return new Built(where.toString(), bind);
    }

    private static boolean isBlank(Object v) {
        return v == null || (v instanceof String s && s.isBlank());
    }

    public record Built(String where, Map<String, Object> bind) {}
}
