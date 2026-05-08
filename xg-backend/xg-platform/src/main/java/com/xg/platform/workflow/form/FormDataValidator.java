package com.xg.platform.workflow.form;

import com.xg.common.exception.BizException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Slf4j
@Component
public class FormDataValidator {

    public void validate(FormSchema schema, Map<String, Object> data) {
        if (schema == null || schema.getFields().isEmpty()) return;

        Map<String, Object> payload = data == null ? Map.of() : data;
        Set<String> knownNames = new HashSet<>();

        for (FormField field : schema.getFields()) {
            knownNames.add(field.getName());
            Object value = payload.get(field.getName());
            boolean missing = isMissing(field, value);

            if (field.isDeprecated()) {
                if (!missing) {
                    log.warn("form field '{}' is deprecated but client sent value", field.getName());
                }
                continue;
            }
            if (field.isRequired() && missing) {
                throw new BizException("FORM_VALIDATION_FAILED",
                        "字段 " + displayName(field) + " 必填");
            }
            if (missing) continue;
            validateType(field, value);
            validateOptions(field, value);
            validatePattern(field, value);
            validateLength(field, value);
            validateRange(field, value);
            validateFileCount(field, value);
        }

        for (String key : payload.keySet()) {
            if (!knownNames.contains(key)) {
                throw new BizException("FORM_VALIDATION_FAILED",
                        "字段 " + key + " 不在表单 schema 中");
            }
        }
    }

    private void validateType(FormField field, Object value) {
        String type = field.getType() == null ? "string" : field.getType().toLowerCase();
        switch (type) {
            case "string":
                if (!(value instanceof String)) typeFail(field, "string");
                break;
            case "number":
                if (!(value instanceof Number)) {
                    if (value instanceof String s) {
                        try { Double.parseDouble(s); } catch (NumberFormatException e) { typeFail(field, "number"); }
                    } else typeFail(field, "number");
                }
                break;
            case "boolean":
                if (!(value instanceof Boolean)) typeFail(field, "boolean");
                break;
            case "date":
                if (!(value instanceof String s)) { typeFail(field, "date"); return; }
                try { LocalDate.parse(s); } catch (DateTimeParseException e) { typeFail(field, "date (YYYY-MM-DD)"); }
                break;
            case "file":
                if (!(value instanceof List<?> list)) { typeFail(field, "file (file_id 数组)"); return; }
                for (Object item : list) {
                    // Snowflake Long IDs are serialized as JSON strings to dodge JS
                    // precision loss, so accept both number and digit-only string.
                    if (item instanceof Number) continue;
                    if (item instanceof String s && !s.isBlank()) {
                        try { Long.parseLong(s); continue; } catch (NumberFormatException ignored) {}
                    }
                    typeFail(field, "file (每项必须是 file_id)");
                }
                break;
            default:
                log.warn("unknown form field type '{}' for {}, skipping type check", type, field.getName());
        }
    }

    private void validateFileCount(FormField field, Object value) {
        if (!"file".equalsIgnoreCase(field.getType())) return;
        if (!(value instanceof List<?> list)) return;
        int max = field.getFileMaxCount() == null ? 1 : field.getFileMaxCount();
        if (list.size() > max) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 最多上传 " + max + " 个文件");
        }
    }

    private boolean isMissing(FormField field, Object value) {
        if (value == null) return true;
        if (value instanceof String s && s.isBlank()) return true;
        if ("file".equalsIgnoreCase(field.getType()) && value instanceof List<?> list && list.isEmpty()) return true;
        return false;
    }

    private void validateOptions(FormField field, Object value) {
        if (field.getOptions() == null || field.getOptions().isEmpty()) return;
        if (!field.getOptions().contains(value.toString())) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 取值必须在 " + field.getOptions() + " 内");
        }
    }

    private void validatePattern(FormField field, Object value) {
        if (field.getPattern() == null || field.getPattern().isBlank()) return;
        if (!(value instanceof String s)) return;
        if (!Pattern.matches(field.getPattern(), s)) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 格式不合法");
        }
    }

    private void validateLength(FormField field, Object value) {
        Integer min = field.getMinLength();
        Integer max = field.getMaxLength();
        if (min == null && max == null) return;
        if (!(value instanceof String s)) return;
        int len = s.codePointCount(0, s.length());
        if (min != null && len < min) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 至少 " + min + " 个字符");
        }
        if (max != null && len > max) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 最多 " + max + " 个字符");
        }
    }

    private void validateRange(FormField field, Object value) {
        Double min = field.getMin();
        Double max = field.getMax();
        if (min == null && max == null) return;
        double n;
        if (value instanceof Number num) n = num.doubleValue();
        else if (value instanceof String s) {
            try { n = Double.parseDouble(s); } catch (NumberFormatException e) { return; }
        } else return;
        if (min != null && n < min) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 不得小于 " + stripTrailingZeros(min));
        }
        if (max != null && n > max) {
            throw new BizException("FORM_VALIDATION_FAILED",
                    "字段 " + displayName(field) + " 不得大于 " + stripTrailingZeros(max));
        }
    }

    private static String stripTrailingZeros(double d) {
        if (d == Math.floor(d) && !Double.isInfinite(d)) return Long.toString((long) d);
        return Double.toString(d);
    }

    private void typeFail(FormField field, String expected) {
        throw new BizException("FORM_VALIDATION_FAILED",
                "字段 " + displayName(field) + " 类型应为 " + expected);
    }

    private String displayName(FormField f) {
        return f.getLabel() != null && !f.getLabel().isBlank() ? f.getLabel() + "(" + f.getName() + ")" : f.getName();
    }
}
