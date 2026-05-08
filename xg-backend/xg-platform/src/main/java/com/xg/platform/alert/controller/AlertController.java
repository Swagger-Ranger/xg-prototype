package com.xg.platform.alert.controller;

import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.alert.dto.AlertActionRequest;
import com.xg.platform.alert.dto.AlertQueryRequest;
import com.xg.platform.alert.model.StudentAlert;
import com.xg.platform.alert.service.StudentAlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class AlertController {

    private final StudentAlertService alertService;

    @GetMapping("/api/v1/alerts")
    public R<PageResult<StudentAlert>> list(@ModelAttribute AlertQueryRequest query) {
        return R.ok(alertService.list(query));
    }

    @GetMapping("/api/v1/alerts/summary")
    public R<Map<String, Object>> summary() {
        return R.ok(alertService.summary());
    }

    @GetMapping("/api/v1/alerts/{id}")
    public R<StudentAlert> detail(@PathVariable Long id) {
        return R.ok(alertService.detail(id));
    }

    @PostMapping("/api/v1/alerts/{id}/acknowledge")
    public R<Void> acknowledge(@PathVariable Long id,
                               @RequestBody(required = false) AlertActionRequest req,
                               @RequestHeader("X-User-Id") Long userId) {
        alertService.acknowledge(id, userId, req == null ? null : req.getNote());
        return R.ok();
    }

    @PostMapping("/api/v1/alerts/{id}/resolve")
    public R<Void> resolve(@PathVariable Long id,
                           @RequestBody(required = false) AlertActionRequest req,
                           @RequestHeader("X-User-Id") Long userId) {
        alertService.resolve(id, userId, req == null ? null : req.getNote());
        return R.ok();
    }

    @PostMapping("/api/v1/alerts/{id}/false-positive")
    public R<Void> falsePositive(@PathVariable Long id,
                                 @RequestBody(required = false) AlertActionRequest req,
                                 @RequestHeader("X-User-Id") Long userId) {
        alertService.markFalsePositive(id, userId, req == null ? null : req.getNote());
        return R.ok();
    }

    @PostMapping("/api/v1/alerts/{id}/mute")
    public R<Void> mute(@PathVariable Long id,
                        @RequestBody AlertActionRequest req,
                        @RequestHeader("X-User-Id") Long userId) {
        int days = req.getDays() == null ? 7 : req.getDays();
        alertService.mute(id, userId, days, req.getNote());
        return R.ok();
    }

    @PostMapping("/api/v1/alerts/scan")
    public R<Map<String, Object>> triggerScan() {
        int inserted = alertService.scanCurrentTenant();
        return R.ok(Map.of("inserted", inserted));
    }

    @GetMapping("/api/v1/alert-rules/stats")
    public R<List<Map<String, Object>>> ruleStats(
            @RequestParam(value = "window_days", defaultValue = "30") int windowDays) {
        return R.ok(alertService.listRulesWithStats(windowDays));
    }
}
