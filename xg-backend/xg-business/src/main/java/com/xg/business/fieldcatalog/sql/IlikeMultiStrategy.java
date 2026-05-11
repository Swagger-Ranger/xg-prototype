package com.xg.business.fieldcatalog.sql;

import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/** (col1 ILIKE %?% OR col2 ILIKE %?% ...) — 关键词搜索跨多列。 */
@Component
public class IlikeMultiStrategy implements SqlStrategy {

    @Override
    public String name() { return "ilike_multi"; }

    @Override
    public String fragment(FieldDef field, String paramRef) {
        List<String> columns = field.sql().columns();
        if (columns == null || columns.isEmpty()) {
            throw new IllegalArgumentException("ilike_multi 需要 sql.columns 列表");
        }
        return "(" + columns.stream()
                .map(c -> SqlIdentifiers.requireValid(c, "ilike_multi.column")
                        + " ILIKE CONCAT('%', #{" + paramRef + "}, '%')")
                .collect(Collectors.joining(" OR ")) + ")";
    }
}
