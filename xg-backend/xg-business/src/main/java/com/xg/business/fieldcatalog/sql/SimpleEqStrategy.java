package com.xg.business.fieldcatalog.sql;

import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import org.springframework.stereotype.Component;

/** column = #{paramRef}。 */
@Component
public class SimpleEqStrategy implements SqlStrategy {

    @Override
    public String name() { return "simple_eq"; }

    @Override
    public String fragment(FieldDef field, String paramRef) {
        String column = SqlIdentifiers.requireValid(field.sql().column(), "simple_eq.column");
        return column + " = #{" + paramRef + "}";
    }
}
