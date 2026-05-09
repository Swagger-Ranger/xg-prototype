package com.xg.business.violation.controller;

import com.xg.business.violation.dto.PunishmentCreateRequest;
import com.xg.business.violation.dto.PunishmentQueryRequest;
import com.xg.business.violation.dto.ViolationAppealCreateRequest;
import com.xg.business.violation.dto.ViolationAppealQueryRequest;
import com.xg.business.violation.dto.ViolationAppealResolveRequest;
import com.xg.business.violation.dto.ViolationCreateRequest;
import com.xg.business.violation.dto.ViolationQueryRequest;
import com.xg.business.violation.dto.ViolationRejectRequest;
import com.xg.business.violation.model.Punishment;
import com.xg.business.violation.model.ViolationAppeal;
import com.xg.business.violation.model.ViolationRecord;
import com.xg.business.violation.service.ViolationService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
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
            @RequestBody @Validated ViolationCreateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.recordViolation(req, userId));
    }

    @GetMapping("/api/v1/violations")
    public R<PageResult<ViolationRecord>> listViolations(@Validated ViolationQueryRequest query) {
        return R.ok(violationService.listViolations(query));
    }

    @GetMapping("/api/v1/violations/{id}")
    public R<ViolationRecord> violationDetail(@PathVariable Long id) {
        return R.ok(violationService.violationDetail(id));
    }

    @PostMapping("/api/v1/violations/{id}/submit")
    public R<ViolationRecord> submitForApproval(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.submitForApproval(id, userId));
    }

    @PostMapping("/api/v1/violations/{id}/approve")
    public R<ViolationRecord> approve(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.approve(id, userId));
    }

    @PostMapping("/api/v1/violations/{id}/reject")
    public R<ViolationRecord> reject(
            @PathVariable Long id,
            @RequestBody @Validated ViolationRejectRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.reject(id, req, userId));
    }

    @PostMapping("/api/v1/punishments")
    public R<Punishment> issuePunishment(
            @RequestBody @Validated PunishmentCreateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.issuePunishment(req, userId));
    }

    @GetMapping("/api/v1/punishments")
    public R<PageResult<Punishment>> listPunishments(@Validated PunishmentQueryRequest query) {
        return R.ok(violationService.listPunishments(query));
    }

    @GetMapping("/api/v1/punishments/{id}")
    public R<Punishment> punishmentDetail(@PathVariable Long id) {
        return R.ok(violationService.punishmentDetail(id));
    }

    @PostMapping("/api/v1/violations/appeals")
    public R<ViolationAppeal> submitAppeal(
            @RequestBody @Validated ViolationAppealCreateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.submitAppeal(req, userId));
    }

    @GetMapping("/api/v1/violations/appeals")
    public R<PageResult<ViolationAppeal>> listAppeals(@Validated ViolationAppealQueryRequest query) {
        return R.ok(violationService.listAppeals(query));
    }

    @GetMapping("/api/v1/violations/appeals/{id}")
    public R<ViolationAppeal> appealDetail(@PathVariable Long id) {
        return R.ok(violationService.appealDetail(id));
    }

    @PostMapping("/api/v1/violations/appeals/{id}/resolve")
    public R<ViolationAppeal> resolveAppeal(
            @PathVariable Long id,
            @RequestBody @Validated ViolationAppealResolveRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(violationService.resolveAppeal(id, req, userId));
    }
}
