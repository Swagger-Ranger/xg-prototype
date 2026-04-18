package com.xg.business.violation.controller;

import com.xg.business.violation.dto.PunishmentCreateRequest;
import com.xg.business.violation.dto.PunishmentQueryRequest;
import com.xg.business.violation.dto.ViolationCreateRequest;
import com.xg.business.violation.dto.ViolationQueryRequest;
import com.xg.business.violation.model.Punishment;
import com.xg.business.violation.model.ViolationRecord;
import com.xg.business.violation.service.ViolationService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class ViolationController {

    private final ViolationService violationService;

    @PostMapping("/api/v1/violations")
    public R<ViolationRecord> recordViolation(
            @RequestBody @Validated ViolationCreateRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(violationService.recordViolation(req, userId, userName));
    }

    @GetMapping("/api/v1/violations")
    public R<PageResult<ViolationRecord>> listViolations(@Validated ViolationQueryRequest query) {
        return R.ok(violationService.listViolations(query));
    }

    @GetMapping("/api/v1/violations/{id}")
    public R<ViolationRecord> violationDetail(@PathVariable Long id) {
        return R.ok(violationService.violationDetail(id));
    }

    @PostMapping("/api/v1/punishments")
    public R<Punishment> issuePunishment(
            @RequestBody @Validated PunishmentCreateRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(violationService.issuePunishment(req, userId, userName));
    }

    @GetMapping("/api/v1/punishments")
    public R<PageResult<Punishment>> listPunishments(@Validated PunishmentQueryRequest query) {
        return R.ok(violationService.listPunishments(query));
    }

    @GetMapping("/api/v1/punishments/{id}")
    public R<Punishment> punishmentDetail(@PathVariable Long id) {
        return R.ok(violationService.punishmentDetail(id));
    }
}
