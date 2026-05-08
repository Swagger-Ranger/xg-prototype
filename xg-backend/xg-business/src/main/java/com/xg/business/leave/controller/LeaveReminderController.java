package com.xg.business.leave.controller;

import com.xg.business.leave.scheduler.LeaveReminderScheduler;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * Manual trigger for the leave-reminder scan. Mirrors the 15-minute cron but
 * runs immediately so QA can verify the four reminder branches without waiting
 * out a real time window. Production keeps the cron as the authoritative path.
 */
@RestController
@RequiredArgsConstructor
public class LeaveReminderController {

    private static final Set<String> ADMIN_ROLES = Set.of("student_affairs_officer", "school_admin");

    private final LeaveReminderScheduler scheduler;
    private final AssigneeLookupMapper roleLookup;

    @PostMapping("/api/v1/admin/leave-reminder/run-once")
    public R<Integer> runOnce(@RequestHeader("X-User-Id") Long userId) {
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可手动触发请假提醒扫描");
        }
        return R.ok(scheduler.runOnce("manual"));
    }
}
