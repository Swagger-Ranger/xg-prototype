package com.xg.platform.workflow.form;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class FormSchema {
    private List<FormField> fields = new ArrayList<>();

    @SuppressWarnings("unchecked")
    public static FormSchema fromSnapshot(Map<String, Object> snapshot) {
        FormSchema schema = new FormSchema();
        if (snapshot == null) return schema;
        Object formObj = snapshot.get("form");
        if (!(formObj instanceof Map<?, ?> formMap)) return schema;
        Object fieldsObj = formMap.get("fields");
        if (!(fieldsObj instanceof List<?> list)) return schema;

        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) continue;
            FormField f = new FormField();
            f.setName(asString(m.get("name")));
            f.setLabel(asString(m.get("label")));
            f.setType(asString(m.get("type")));
            f.setRequired(Boolean.TRUE.equals(m.get("required")));
            f.setIndexed(Boolean.TRUE.equals(m.get("indexed")));
            f.setDeprecated(Boolean.TRUE.equals(m.get("deprecated")));
            f.setPlaceholder(asString(m.get("placeholder")));
            f.setPattern(asString(m.get("pattern")));
            f.setMinLength(asInt(m.get("minLength")));
            f.setMaxLength(asInt(m.get("maxLength")));
            f.setMin(asDouble(m.get("min")));
            f.setMax(asDouble(m.get("max")));
            f.setWidget(asString(m.get("widget")));
            f.setFileMaxCount(asInt(m.get("fileMaxCount")));
            f.setFileAccept(asString(m.get("fileAccept")));
            f.setFileMaxSizeKb(asLong(m.get("fileMaxSizeKb")));
            Object opts = m.get("options");
            if (opts instanceof List<?> ol) {
                List<String> options = new ArrayList<>(ol.size());
                for (Object o : ol) options.add(asString(o));
                f.setOptions(options);
            }
            if (f.getName() != null && !f.getName().isBlank()) {
                schema.getFields().add(f);
            }
        }
        return schema;
    }

    private static String asString(Object o) {
        return o == null ? null : o.toString();
    }

    private static Integer asInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(o.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static Double asDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }
}
