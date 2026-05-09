package com.xg.business.academic.controller;

import com.xg.business.academic.scheduler.ClassScheduleSyncScheduler;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * Manual trigger for the class-schedule sync — mirrors the daily 03:00 cron
 * but runs immediately. Intended for admin use after a manual import or to
 * verify connectivity to the (eventual) external 教务 source.
 */
@RestController
@RequiredArgsConstructor
public class ClassScheduleSyncController {

    private static final Set<String> ADMIN_ROLES = Set.of("student_affairs_officer", "school_admin");

    private final ClassScheduleSyncScheduler scheduler;
    private final AssigneeLookupMapper roleLookup;

    @PostMapping("/api/v1/admin/class-schedules/sync")
    public R<Integer> runOnce() {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可手动触发课表同步");
        }
        return R.ok(scheduler.runOnce("manual"));
    }
}
