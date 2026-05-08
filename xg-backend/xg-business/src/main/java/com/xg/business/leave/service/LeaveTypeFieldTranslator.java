package com.xg.business.leave.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.form.FormField;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bidirectional adapter between the {@code FormFieldPayload} shape used by the
 * 表单管理 GUI editor and the {@code field_key/field_label/field_type} shape that
 * legacy {@code leave_type_config.extra_fields} entries already use.
 *
 * <p>Mapping table (uiType ↔ field_type):
 * <ul>
 *   <li>string + no widget          ↔ field_type='text'</li>
 *   <li>string + widget=textarea    ↔ field_type='text', field_widget='textarea'</li>
 *   <li>string + options            ↔ field_type='select'</li>
 *   <li>string + options + radio    ↔ field_type='select', field_widget='radio'</li>
 *   <li>number / boolean / date / file → 1:1</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class LeaveTypeFieldTranslator {

    private static final Set<String> ALLOWED_TYPES = Set.of("string", "number", "boolean", "date", "file");

    private final ObjectMapper objectMapper;

    /**
     * Convert a list of GUI-editor payloads into the legacy extra_fields JSON
     * shape. Returns the JSON string for direct write to {@code extra_fields}.
     */
    public String toExtraFieldsJson(List<Map<String, Object>> payloads) {
        List<Map<String, Object>> out = new ArrayList<>(payloads.size());
        for (Map<String, Object> p : payloads) {
            out.add(payloadToExtraField(p));
        }
        try {
            return objectMapper.writeValueAsString(out);
        } catch (Exception e) {
            throw new BizException("INTERNAL_ERROR", "类型表单序列化失败: " + e.getMessage());
        }
    }

    /**
     * Convert stored extra_fields JSON into runtime {@link FormField} entries
     * so {@code FormDataValidator} can validate them alongside the workflow's
     * public form schema. Without this merge, leave-type-only fields like
     * {@code reason_category}/{@code evidence} would be flagged as "未知字段".
     */
    public List<FormField> toFormFields(String extraFieldsJson) {
        List<Map<String, Object>> guiPayloads = fromExtraFieldsJson(extraFieldsJson);
        List<FormField> fields = new ArrayList<>(guiPayloads.size());
        for (Map<String, Object> p : guiPayloads) {
            FormField f = new FormField();
            f.setName(stringOf(p.get("name")));
            f.setLabel(stringOf(p.get("label")));
            f.setType(stringOf(p.get("type")));
            f.setRequired(Boolean.TRUE.equals(p.get("required")));
            f.setDeprecated(Boolean.TRUE.equals(p.get("deprecated")));
            f.setPlaceholder(stringOf(p.get("placeholder")));
            f.setPattern(stringOf(p.get("pattern")));
            f.setWidget(stringOf(p.get("widget")));
            Object opts = p.get("options");
            if (opts instanceof List<?> list) {
                List<String> options = new ArrayList<>();
                for (Object o : list) options.add(o == null ? "" : o.toString());
                f.setOptions(options);
            }
            if (p.get("min") instanceof Number n) f.setMin(n.doubleValue());
            if (p.get("max") instanceof Number n) f.setMax(n.doubleValue());
            if (p.get("minLength") instanceof Number n) f.setMinLength(n.intValue());
            if (p.get("maxLength") instanceof Number n) f.setMaxLength(n.intValue());
            if (p.get("fileMaxCount") instanceof Number n) f.setFileMaxCount(n.intValue());
            f.setFileAccept(stringOf(p.get("fileAccept")));
            if (p.get("fileMaxSizeKb") instanceof Number n) f.setFileMaxSizeKb(n.longValue());
            fields.add(f);
        }
        return fields;
    }

    /**
     * Parse a stored extra_fields JSON string and return the list of
     * GUI-editor-shaped maps (each carries name/label/type/widget/options/...).
     * Used when the GUI editor loads existing fields for editing.
     */
    public List<Map<String, Object>> fromExtraFieldsJson(String extraFieldsJson) {
        if (extraFieldsJson == null || extraFieldsJson.isBlank()) {
            return List.of();
        }
        List<Map<String, Object>> raw;
        try {
            raw = objectMapper.readValue(extraFieldsJson, new TypeReference<>() {});
        } catch (Exception e) {
            throw new BizException("INTERNAL_ERROR", "类型表单解析失败: " + e.getMessage());
        }
        List<Map<String, Object>> out = new ArrayList<>(raw.size());
        for (Map<String, Object> r : raw) {
            out.add(extraFieldToPayload(r));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> payloadToExtraField(Map<String, Object> p) {
        String name = stringOf(p.get("name"));
        String label = stringOf(p.get("label"));
        String type = stringOf(p.get("type"));
        if (name == null || !name.matches("^[a-z][a-z0-9_]{0,63}$")) {
            throw new BizException("INVALID_FIELD_NAME", "字段标识必须是 snake_case: " + name);
        }
        if (label == null || label.isBlank()) {
            throw new BizException("INVALID_ARGUMENT", "字段 " + name + " 缺少 label");
        }
        if (type == null || !ALLOWED_TYPES.contains(type)) {
            throw new BizException("UNSUPPORTED_FIELD_TYPE", "暂不支持的字段类型: " + type);
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("field_key", name);
        m.put("field_label", label);
        // Translate type/widget back to field_type. Select uses synthetic field_type='select'.
        Object optsObj = p.get("options");
        boolean hasOptions = optsObj instanceof List<?> l && !l.isEmpty();
        String widget = stringOf(p.get("widget"));
        String fieldType = mapTypeToFieldType(type, hasOptions);
        m.put("field_type", fieldType);
        if (Boolean.TRUE.equals(p.get("required"))) m.put("required", true);
        if (Boolean.TRUE.equals(p.get("deprecated"))) m.put("deprecated", true);
        if (hasOptions) m.put("options", new ArrayList<>((List<Object>) optsObj));
        if (notBlank(widget)) m.put("field_widget", widget);
        if (notBlank(stringOf(p.get("placeholder")))) m.put("placeholder", p.get("placeholder"));
        if (notBlank(stringOf(p.get("pattern")))) m.put("pattern", p.get("pattern"));
        if (p.get("min") != null) m.put("min", p.get("min"));
        if (p.get("max") != null) m.put("max", p.get("max"));
        if (p.get("minLength") != null) m.put("min_length", p.get("minLength"));
        if (p.get("maxLength") != null) m.put("max_length", p.get("maxLength"));
        if (p.get("fileMaxCount") != null) m.put("file_max_count", p.get("fileMaxCount"));
        if (notBlank(stringOf(p.get("fileAccept")))) m.put("file_accept", p.get("fileAccept"));
        if (p.get("fileMaxSizeKb") != null) m.put("file_max_size_kb", p.get("fileMaxSizeKb"));
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extraFieldToPayload(Map<String, Object> r) {
        Map<String, Object> p = new LinkedHashMap<>();
        String fieldKey = stringOf(r.get("field_key"));
        String fieldLabel = stringOf(r.get("field_label"));
        String fieldType = stringOf(r.get("field_type"));
        String fieldWidget = stringOf(r.get("field_widget"));

        p.put("name", fieldKey);
        p.put("label", fieldLabel);
        Object opts = r.get("options");
        boolean hasOptions = opts instanceof List<?> l && !l.isEmpty();

        // field_type='select' → string with options. Otherwise direct mapping.
        String resolvedType;
        String resolvedWidget = null;
        switch (fieldType == null ? "" : fieldType) {
            case "select":
                resolvedType = "string";
                resolvedWidget = "radio".equals(fieldWidget) ? "radio" : "select";
                break;
            case "text":
            case "":
                resolvedType = "string";
                if ("textarea".equals(fieldWidget)) resolvedWidget = "textarea";
                break;
            case "number":
            case "boolean":
            case "date":
                resolvedType = fieldType;
                break;
            case "file":
                resolvedType = "file";
                // Preserve widget for file fields so signature widget round-trips.
                if ("signature".equals(fieldWidget)) resolvedWidget = "signature";
                break;
            default:
                resolvedType = "string";
        }
        p.put("type", resolvedType);
        if (resolvedWidget != null) p.put("widget", resolvedWidget);
        if (Boolean.TRUE.equals(r.get("required"))) p.put("required", true);
        if (Boolean.TRUE.equals(r.get("deprecated"))) p.put("deprecated", true);
        if (hasOptions) p.put("options", new ArrayList<>((List<Object>) opts));
        if (notBlank(stringOf(r.get("placeholder")))) p.put("placeholder", r.get("placeholder"));
        if (notBlank(stringOf(r.get("pattern")))) p.put("pattern", r.get("pattern"));
        if (r.get("min") != null) p.put("min", r.get("min"));
        if (r.get("max") != null) p.put("max", r.get("max"));
        if (r.get("min_length") != null) p.put("minLength", r.get("min_length"));
        if (r.get("max_length") != null) p.put("maxLength", r.get("max_length"));
        if (r.get("file_max_count") != null) p.put("fileMaxCount", r.get("file_max_count"));
        if (notBlank(stringOf(r.get("file_accept")))) p.put("fileAccept", r.get("file_accept"));
        if (r.get("file_max_size_kb") != null) p.put("fileMaxSizeKb", r.get("file_max_size_kb"));
        return p;
    }

    private String mapTypeToFieldType(String type, boolean hasOptions) {
        if (hasOptions && "string".equals(type)) return "select";
        if ("string".equals(type)) return "text";
        return type; // number / boolean / date / file
    }

    private static String stringOf(Object o) {
        return o == null ? null : o.toString();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
