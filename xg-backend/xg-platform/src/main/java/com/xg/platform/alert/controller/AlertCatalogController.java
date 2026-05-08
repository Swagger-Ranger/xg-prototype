package com.xg.platform.alert.controller;

import com.xg.common.base.R;
import com.xg.platform.alert.catalog.AlertDimension;
import com.xg.platform.alert.catalog.AlertFieldCatalog;
import com.xg.platform.event.StudentEventType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only catalog for DSL authoring UIs and NL-config agents:
 * which dimensions exist, which event_types back each, and which
 * event_data.* fields are addressable in filter / field / condition.
 */
@RestController
public class AlertCatalogController {

    @GetMapping("/api/v1/alert/catalog")
    public R<Map<String, Object>> catalog() {
        List<Map<String, Object>> dimensions = new ArrayList<>();
        for (AlertDimension d : AlertDimension.values()) {
            List<Map<String, Object>> eventTypes = new ArrayList<>();
            for (StudentEventType t : d.eventTypes()) {
                Map<String, Object> et = new LinkedHashMap<>();
                et.put("code", t.code());
                et.put("default_severity", t.defaultSeverity());
                eventTypes.add(et);
            }
            List<Map<String, Object>> fields = new ArrayList<>();
            for (AlertFieldCatalog.Field f : AlertFieldCatalog.fieldsOf(d)) {
                Map<String, Object> fm = new LinkedHashMap<>();
                fm.put("path", f.path());
                fm.put("type", f.type());
                fm.put("description", f.description());
                fields.add(fm);
            }
            Map<String, Object> dim = new LinkedHashMap<>();
            dim.put("code", d.code());
            dim.put("event_types", eventTypes);
            dim.put("fields", fields);
            dimensions.add(dim);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dimensions", dimensions);
        out.put("common_fields", List.of(
                Map.of("path", "event_type",   "type", "string"),
                Map.of("path", "severity",     "type", "number"),
                Map.of("path", "occurred_at",  "type", "timestamp"),
                Map.of("path", "event_source", "type", "string")
        ));
        out.put("ops",            List.of("count", "sum", "avg", "max", "min", "distinct_days", "consecutive_days", "exists"));
        out.put("window_types",   List.of("rolling", "calendar_month", "calendar_week", "semester"));
        out.put("compare_to",     List.of("previous_period", "previous_month", "previous_week"));
        out.put("notify_targets", List.of("counselor", "parent", "self"));
        out.put("ai_hook_targets", List.of("severity", "filter"));
        out.put("sample_rules", sampleRules());
        return R.ok(out);
    }

    private List<Map<String, Object>> sampleRules() {
        Map<String, Object> sample = new LinkedHashMap<>();
        sample.put("name", "连续旷课+违纪");
        sample.put("window", Map.of("type", "rolling", "days", 14));
        sample.put("aggregations", Map.of(
                "absent_streak", Map.of("dimension", "absence", "op", "consecutive_days"),
                "violation_cnt", Map.of("dimension", "violation", "op", "count")
        ));
        sample.put("condition", "absent_streak > 3 AND violation_cnt > 1");
        sample.put("severity", 6);
        return List.of(sample);
    }
}
