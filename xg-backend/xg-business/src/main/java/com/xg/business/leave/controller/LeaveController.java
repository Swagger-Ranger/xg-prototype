package com.xg.business.leave.controller;

import com.xg.business.leave.dto.LeaveApplyRequest;
import com.xg.business.leave.dto.LeaveProxyRequest;
import com.xg.business.leave.dto.LeaveQueryRequest;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.business.leave.service.LeaveService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class LeaveController {

    private final LeaveService leaveService;

    @GetMapping("/api/v1/leave-types")
    public R<List<LeaveTypeConfig>> listLeaveTypes() {
        return R.ok(leaveService.listLeaveTypes());
    }

    @PostMapping("/api/v1/leaves")
    public R<LeaveRequest> apply(
            @RequestBody @Validated LeaveApplyRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(leaveService.apply(req, userId, userName));
    }

    @PostMapping("/api/v1/leaves/proxy")
    public R<LeaveRequest> proxyApply(
            @RequestBody @Validated LeaveProxyRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(leaveService.proxyApply(req, userId));
    }

    @GetMapping("/api/v1/leaves/my")
    public R<PageResult<LeaveRequest>> myLeaves(
            @RequestHeader("X-User-Id") Long userId,
            @Validated LeaveQueryRequest query) {
        return R.ok(leaveService.myLeaves(userId, query));
    }

    @GetMapping("/api/v1/leaves/{id}")
    public R<LeaveRequest> getDetail(@PathVariable Long id) {
        return R.ok(leaveService.getDetail(id));
    }

    @PostMapping("/api/v1/leaves/{id}/withdraw")
    public R<Void> withdraw(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.withdraw(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel")
    public R<Void> cancelLeave(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.cancelLeave(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel-confirm")
    public R<Void> confirmCancel(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.confirmCancel(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/force-cancel")
    public R<Void> forceCancel(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.forceCancel(id, userId);
        return R.ok();
    }

    @GetMapping("/api/v1/leaves/class")
    public R<PageResult<LeaveRequest>> classLeaves(
            @RequestHeader("X-User-Id") Long userId,
            @Validated LeaveQueryRequest query) {
        return R.ok(leaveService.classLeaves(userId, query));
    }

    @GetMapping("/api/v1/leaves/uncancelled")
    public R<PageResult<LeaveRequest>> uncancelledLeaves(@Validated LeaveQueryRequest query) {
        return R.ok(leaveService.uncancelledLeaves(query));
    }

    @GetMapping("/api/v1/leaves/stats")
    public R<Map<String, Object>> leaveStats(@Validated LeaveQueryRequest query) {
        return R.ok(leaveService.leaveStats(query));
    }
}
