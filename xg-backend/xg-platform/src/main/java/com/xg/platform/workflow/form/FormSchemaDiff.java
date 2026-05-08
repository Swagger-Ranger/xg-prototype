package com.xg.platform.workflow.form;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Classifies the difference between two form schemas into three levels:
 *
 *  <ul>
 *    <li>GREEN  — forward-compatible (add optional field, add enum, loosen bounds, rename label)</li>
 *    <li>YELLOW — semi-compatible (new required field, tighten bounds, add pattern) — in-flight
 *                instances are protected by their snapshot, but new submissions see stricter rules</li>
 *    <li>RED    — breaking (delete non-deprecated field, change type, narrow enum) — admin should
 *                publish a NEW code version instead of mutating the existing one</li>
 *  </ul>
 */
public final class FormSchemaDiff {

    private FormSchemaDiff() {}

    public enum Level { GREEN, YELLOW, RED }

    public record Change(Level level, String field, String kind, String message) {}

    public static List<Change> diff(FormSchema oldSchema, FormSchema newSchema) {
        List<Change> changes = new ArrayList<>();
        Map<String, FormField> oldByName = indexByName(oldSchema);
        Map<String, FormField> newByName = indexByName(newSchema);

        for (Map.Entry<String, FormField> e : oldByName.entrySet()) {
            String name = e.getKey();
            FormField o = e.getValue();
            FormField n = newByName.get(name);
            if (n == null) {
                if (o.isDeprecated()) {
                    changes.add(new Change(Level.YELLOW, name, "field_removed_deprecated",
                            "字段 " + name + " 删除（之前已标记 deprecated）"));
                } else {
                    changes.add(new Change(Level.RED, name, "field_removed",
                            "字段 " + name + " 被删除；历史数据仍保留该字段值，建议先 deprecated: true 软删"));
                }
                continue;
            }
            diffField(name, o, n, changes);
        }

        for (Map.Entry<String, FormField> e : newByName.entrySet()) {
            if (oldByName.containsKey(e.getKey())) continue;
            FormField f = e.getValue();
            if (f.isRequired()) {
                changes.add(new Change(Level.YELLOW, f.getName(), "field_added_required",
                        "新增必填字段 " + f.getName() + "；在途实例走 snapshot 不受影响，但新提交会强制校验"));
            } else {
                changes.add(new Change(Level.GREEN, f.getName(), "field_added",
                        "新增可选字段 " + f.getName()));
            }
        }

        return changes;
    }

    public static Level maxLevel(List<Change> changes) {
        Level max = Level.GREEN;
        for (Change c : changes) {
            if (c.level().ordinal() > max.ordinal()) max = c.level();
        }
        return max;
    }

    private static void diffField(String name, FormField o, FormField n, List<Change> out) {
        String ot = nvl(o.getType(), "string");
        String nt = nvl(n.getType(), "string");
        if (!ot.equals(nt)) {
            out.add(new Change(Level.RED, name, "type_changed",
                    "字段 " + name + " 类型从 " + ot + " 改为 " + nt));
            return;
        }
        if (!o.isRequired() && n.isRequired()) {
            out.add(new Change(Level.YELLOW, name, "required_added",
                    "字段 " + name + " 改为必填（历史记录中可能留空）"));
        } else if (o.isRequired() && !n.isRequired()) {
            out.add(new Change(Level.GREEN, name, "required_relaxed",
                    "字段 " + name + " 改为选填"));
        }
        if (intTightened(o.getMinLength(), n.getMinLength(), true)
                || intTightened(o.getMaxLength(), n.getMaxLength(), false)) {
            out.add(new Change(Level.YELLOW, name, "length_tightened",
                    "字段 " + name + " 长度约束收紧"));
        }
        if (dblTightened(o.getMin(), n.getMin(), true)
                || dblTightened(o.getMax(), n.getMax(), false)) {
            out.add(new Change(Level.YELLOW, name, "range_tightened",
                    "字段 " + name + " 数值范围收紧"));
        }
        if (!Objects.equals(o.getPattern(), n.getPattern())) {
            if (o.getPattern() == null || o.getPattern().isBlank()) {
                out.add(new Change(Level.YELLOW, name, "pattern_added",
                        "字段 " + name + " 新增正则校验"));
            } else if (n.getPattern() == null || n.getPattern().isBlank()) {
                out.add(new Change(Level.GREEN, name, "pattern_removed",
                        "字段 " + name + " 移除正则校验"));
            } else {
                out.add(new Change(Level.YELLOW, name, "pattern_changed",
                        "字段 " + name + " 正则变更"));
            }
        }
        boolean oHasOpts = o.getOptions() != null && !o.getOptions().isEmpty();
        boolean nHasOpts = n.getOptions() != null && !n.getOptions().isEmpty();
        if (oHasOpts && nHasOpts) {
            Set<String> removed = new LinkedHashSet<>(o.getOptions());
            removed.removeAll(n.getOptions());
            if (!removed.isEmpty()) {
                // YELLOW (was RED): in-flight instances are snapshot-locked, finished
                // instances are immutable history. Removing/renaming options only
                // affects how the new dropdown displays old values — not data loss.
                out.add(new Change(Level.YELLOW, name, "options_removed",
                        "字段 " + name + " 删除枚举项 " + removed
                                + "；历史数据仍保留原值，但审批端下拉里看不到"));
            }
            Set<String> added = new LinkedHashSet<>(n.getOptions());
            added.removeAll(o.getOptions());
            if (!added.isEmpty()) {
                out.add(new Change(Level.GREEN, name, "options_added",
                        "字段 " + name + " 新增枚举项 " + added));
            }
        } else if (!oHasOpts && nHasOpts) {
            out.add(new Change(Level.YELLOW, name, "options_introduced",
                    "字段 " + name + " 改为枚举受限；历史自由值可能不在新枚举内"));
        } else if (oHasOpts && !nHasOpts) {
            out.add(new Change(Level.GREEN, name, "options_dropped",
                    "字段 " + name + " 不再限制枚举"));
        }
        if (!o.isDeprecated() && n.isDeprecated()) {
            out.add(new Change(Level.GREEN, name, "deprecated",
                    "字段 " + name + " 标记为 deprecated（软删除）"));
        }
    }

    private static Map<String, FormField> indexByName(FormSchema schema) {
        Map<String, FormField> m = new LinkedHashMap<>();
        if (schema == null || schema.getFields() == null) return m;
        for (FormField f : schema.getFields()) {
            if (f.getName() != null) m.put(f.getName(), f);
        }
        return m;
    }

    private static String nvl(String s, String d) { return s == null ? d : s; }

    private static boolean intTightened(Integer oldV, Integer newV, boolean isMin) {
        if (newV == null) return false;
        if (oldV == null) return true;
        return isMin ? newV > oldV : newV < oldV;
    }

    private static boolean dblTightened(Double oldV, Double newV, boolean isMin) {
        if (newV == null) return false;
        if (oldV == null) return true;
        return isMin ? newV > oldV : newV < oldV;
    }
}
