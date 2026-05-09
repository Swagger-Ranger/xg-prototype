package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.YearSettingUpsertRequest;
import com.xg.business.workstudy.model.WorkStudyYearSetting;
import com.xg.business.workstudy.service.YearSettingService;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequiredArgsConstructor
public class YearSettingController {

    private static final Set<String> ADMIN_ROLES = Set.of("student_affairs_officer", "school_admin");

    private final YearSettingService yearSettingService;
    private final AssigneeLookupMapper roleLookup;

    @GetMapping("/api/v1/work-study/year-settings")
    public R<List<WorkStudyYearSetting>> list() {
        return R.ok(yearSettingService.list());
    }

    @GetMapping("/api/v1/work-study/year-settings/{year}")
    public R<WorkStudyYearSetting> detail(@PathVariable String year) {
        return R.ok(yearSettingService.findByYear(year));
    }

    @PostMapping("/api/v1/work-study/year-settings")
    public R<WorkStudyYearSetting> upsert(
            @RequestBody @Validated YearSettingUpsertRequest req) {
        Long userId = CurrentUser.id();
        requireAdmin(userId);
        return R.ok(yearSettingService.upsert(req));
    }

    /**
     * 把上一学年 positions 复制到本学年（status=draft，hired_count 清零，不自动续聘 applications）。
     */
    @PostMapping("/api/v1/work-study/year-settings/{toYear}/sync-positions")
    public R<Map<String, Object>> syncPositions(
            @PathVariable String toYear,
            @RequestParam String fromYear) {
        Long userId = CurrentUser.id();
        requireAdmin(userId);
        int copied = yearSettingService.syncPositionsFromYear(toYear, fromYear);
        return R.ok(Map.of("copied", copied, "fromYear", fromYear, "toYear", toYear));
    }

    private void requireAdmin(Long userId) {
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可管理学年配置");
        }
    }
}
