package com.xg.platform.alert.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.alert.dsl.AlertRuleDsl;
import com.xg.platform.alert.engine.AlertRuleEngine;
import com.xg.platform.alert.mapper.AlertRuleMapper;
import com.xg.platform.alert.model.AlertRule;
import com.xg.platform.alert.validator.AlertRuleValidator;
import com.xg.platform.insight.client.AiSidecarClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class AlertRuleController {

    private final AlertRuleValidator validator;
    private final AlertRuleEngine engine;
    private final AiSidecarClient aiSidecarClient;
    private final ObjectMapper objectMapper;
    private final AlertRuleMapper alertRuleMapper;

    @PostMapping("/api/v1/alert/rule/validate")
    public R<AlertRuleValidator.ValidationResult> validate(@RequestBody AlertRuleDsl dsl) {
        return R.ok(validator.validate(dsl));
    }

    @PostMapping("/api/v1/alert/rule/preview")
    public R<?> preview(@RequestBody PreviewRequest req) {
        AlertRuleValidator.ValidationResult vr = validator.validate(req.dsl());
        if (!vr.valid()) {
            return R.ok(Map.of("valid", false, "errors", vr.errors()));
        }
        int limit = req.sampleLimit() == null ? 10 : req.sampleLimit();
        AlertRuleEngine.PreviewResult result = engine.preview(req.dsl(), limit);
        return R.ok(Map.of("valid", true, "preview", result));
    }

    @PostMapping("/api/v1/alert/rule/author")
    public R<?> author(@RequestBody AuthorRequest req) {
        String nl = req == null ? null : req.nl();
        if (nl == null || nl.isBlank()) {
            return R.ok(Map.of("ok", false, "error_message", "empty nl"));
        }
        AiSidecarClient.AgentResult res = aiSidecarClient.invokeAgent(
                "alert_rule_author", Map.of(), Map.of("nl", nl), null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("attempts", res.output().getOrDefault("attempts", java.util.List.of()));
        body.put("raw_dsl", res.output().get("dsl"));
        if (!res.ok()) {
            body.put("ok", false);
            body.put("error_message", res.errorMessage());
            return R.ok(body);
        }
        Object dslObj = res.output().get("dsl");
        if (dslObj == null) {
            body.put("ok", false);
            body.put("error_message", res.output().get("error_message"));
            return R.ok(body);
        }
        AlertRuleDsl dsl;
        try {
            dsl = objectMapper.convertValue(dslObj, AlertRuleDsl.class);
        } catch (IllegalArgumentException e) {
            body.put("ok", false);
            body.put("error_message", "dsl binding failed: " + e.getMessage());
            return R.ok(body);
        }
        AlertRuleValidator.ValidationResult vr = validator.validate(dsl);
        body.put("ok", vr.valid());
        body.put("dsl", dsl);
        body.put("validation", vr);
        return R.ok(body);
    }

    @PostMapping("/api/v1/alert/rules")
    public R<?> create(@RequestBody CreateRequest req) {
        Long userId = CurrentUser.id();
        if (req == null || req.dsl() == null) {
            return R.ok(Map.of("ok", false, "error_message", "dsl required"));
        }
        AlertRuleValidator.ValidationResult vr = validator.validate(req.dsl());
        if (!vr.valid()) {
            return R.ok(Map.of("ok", false, "validation", vr));
        }
        AlertRuleDsl dsl = req.dsl();
        Map<String, Object> cfg = objectMapper.convertValue(dsl, new TypeReference<>() {});
        AlertRule rule = new AlertRule();
        rule.setName(dsl.name());
        rule.setDescription(dsl.description());
        rule.setRuleType("dsl");
        rule.setConfig(cfg);
        rule.setSeverity(severityLabelForCreate(dsl.severity()));
        rule.setEnabled(dsl.enabled() == null ? Boolean.TRUE : dsl.enabled());
        rule.setCreatedBy(userId);
        rule.setUpdatedBy(userId);
        alertRuleMapper.insert(rule);
        return R.ok(Map.of("ok", true, "id", rule.getId()));
    }

    private static String severityLabelForCreate(Integer severity) {
        int s = severity == null ? 5 : severity;
        if (s >= 9) return "critical";
        if (s >= 7) return "high";
        if (s >= 4) return "medium";
        return "low";
    }

    @GetMapping("/api/v1/alert/rules/{id}")
    public R<?> detail(@PathVariable Long id) {
        AlertRule rule = alertRuleMapper.selectById(id);
        if (rule == null) return R.ok(Map.of("ok", false, "error_message", "not found"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", rule.getId());
        out.put("name", rule.getName());
        out.put("description", rule.getDescription());
        out.put("rule_type", rule.getRuleType());
        out.put("severity", rule.getSeverity());
        out.put("enabled", rule.getEnabled());
        out.put("config", rule.getConfig());
        return R.ok(out);
    }

    @PatchMapping("/api/v1/alert/rules/{id}")
    public R<?> patch(@PathVariable Long id, @RequestBody PatchRequest req) {
        Long userId = CurrentUser.id();
        AlertRule rule = alertRuleMapper.selectById(id);
        if (rule == null) return R.ok(Map.of("ok", false, "error_message", "not found"));
        if (req.enabled() != null) rule.setEnabled(req.enabled());
        if (req.dsl() != null) {
            AlertRuleValidator.ValidationResult vr = validator.validate(req.dsl());
            if (!vr.valid()) return R.ok(Map.of("ok", false, "validation", vr));
            AlertRuleDsl dsl = req.dsl();
            Map<String, Object> cfg = objectMapper.convertValue(dsl, new TypeReference<>() {});
            rule.setName(dsl.name());
            rule.setDescription(dsl.description());
            rule.setConfig(cfg);
            rule.setSeverity(severityLabelForCreate(dsl.severity()));
            rule.setRuleType("dsl");
        } else {
            if (req.name() != null) rule.setName(req.name());
            if (req.description() != null) rule.setDescription(req.description());
            if (req.severity() != null) rule.setSeverity(req.severity());
            if (req.config() != null) rule.setConfig(req.config());
        }
        rule.setUpdatedBy(userId);
        alertRuleMapper.updateById(rule);
        return R.ok(Map.of("ok", true));
    }

    @DeleteMapping("/api/v1/alert/rules/{id}")
    public R<?> delete(@PathVariable Long id) {
        int n = alertRuleMapper.deleteById(id);
        return R.ok(Map.of("ok", n > 0));
    }

    public record PreviewRequest(AlertRuleDsl dsl, Integer sampleLimit) {}

    public record AuthorRequest(String nl) {}

    public record CreateRequest(AlertRuleDsl dsl) {}

    public record PatchRequest(
            Boolean enabled,
            AlertRuleDsl dsl,
            String name,
            String description,
            String severity,
            Map<String, Object> config
    ) {}
}
