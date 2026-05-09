package com.xg.business.worklog.controller;

import com.xg.business.worklog.dto.WorkLogCreateRequest;
import com.xg.business.worklog.dto.WorkLogQueryRequest;
import com.xg.business.worklog.model.WorkLog;
import com.xg.business.worklog.service.WorkLogService;
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
public class WorkLogController {

    private final WorkLogService workLogService;

    @PostMapping("/api/v1/work-logs")
    public R<WorkLog> create(
            @RequestBody @Validated WorkLogCreateRequest req,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        Long userId = CurrentUser.id();
        return R.ok(workLogService.create(req, userId, userName));
    }

    @GetMapping("/api/v1/work-logs")
    public R<PageResult<WorkLog>> listMy(
            @Validated WorkLogQueryRequest query) {
        Long userId = CurrentUser.id();
        return R.ok(workLogService.list(query, userId));
    }

    @GetMapping("/api/v1/work-logs/{id}")
    public R<WorkLog> detail(@PathVariable Long id) {
        return R.ok(workLogService.detail(id));
    }

    @DeleteMapping("/api/v1/work-logs/{id}")
    public R<Void> delete(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        workLogService.delete(id, userId);
        return R.ok();
    }
}
