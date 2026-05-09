package com.xg.business.checkin.controller;

import com.xg.business.checkin.dto.CheckinQueryRequest;
import com.xg.business.checkin.dto.CreateActivityRequest;
import com.xg.business.checkin.dto.RollCallRequest;
import com.xg.business.checkin.dto.ScanCheckinRequest;
import com.xg.business.checkin.dto.SupplementRequest;
import com.xg.business.checkin.model.CheckinActivity;
import com.xg.business.checkin.model.CheckinRecord;
import com.xg.business.checkin.service.CheckinService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class CheckinController {

    private final CheckinService checkinService;

    @PostMapping("/api/v1/checkins/activities")
    public R<CheckinActivity> createActivity(
            @RequestBody @Validated CreateActivityRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(checkinService.createActivity(req, userId));
    }

    @GetMapping("/api/v1/checkins/activities")
    public R<PageResult<CheckinActivity>> myActivities(
            @Validated CheckinQueryRequest query) {
        Long userId = CurrentUser.id();
        return R.ok(checkinService.myActivities(userId, query));
    }

    @GetMapping("/api/v1/checkins/activities/{id}")
    public R<CheckinActivity> getActivity(@PathVariable Long id) {
        return R.ok(checkinService.getActivity(id));
    }

    @GetMapping("/api/v1/checkins/activities/{id}/qrcode")
    public R<Map<String, Object>> getQrCode(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        return R.ok(checkinService.getQrCode(id, userId));
    }

    @PostMapping("/api/v1/checkins/activities/{id}/close")
    public R<Void> closeActivity(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        checkinService.closeActivity(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/checkins/scan")
    public R<CheckinRecord> scan(
            @RequestBody @Validated ScanCheckinRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(checkinService.scan(req, userId));
    }

    @PostMapping("/api/v1/checkins/checkout")
    public R<Void> checkout(
            @RequestParam Long activityId) {
        Long userId = CurrentUser.id();
        checkinService.checkout(activityId, userId);
        return R.ok();
    }

    @GetMapping("/api/v1/checkins/activities/{id}/records")
    public R<List<CheckinRecord>> getRecords(@PathVariable Long id) {
        return R.ok(checkinService.getRecords(id));
    }

    @PostMapping("/api/v1/checkins/activities/{id}/roll-call")
    public R<Void> rollCall(
            @PathVariable Long id,
            @RequestBody @Validated RollCallRequest req) {
        Long userId = CurrentUser.id();
        checkinService.rollCall(id, req, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/checkins/activities/{id}/supplement")
    public R<CheckinRecord> supplement(
            @PathVariable Long id,
            @RequestBody @Validated SupplementRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(checkinService.supplement(id, req, userId));
    }
}
