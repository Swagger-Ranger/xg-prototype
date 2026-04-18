package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.ApplicationCreateRequest;
import com.xg.business.workstudy.dto.ApplicationDecisionRequest;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.PositionCreateRequest;
import com.xg.business.workstudy.dto.PositionQueryRequest;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.service.WorkStudyService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class WorkStudyController {

    private final WorkStudyService workStudyService;

    @PostMapping("/api/v1/work-study/positions")
    public R<WorkStudyPosition> createPosition(
            @RequestBody @Validated PositionCreateRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(workStudyService.createPosition(req, userId));
    }

    @GetMapping("/api/v1/work-study/positions")
    public R<PageResult<WorkStudyPosition>> listPositions(@Validated PositionQueryRequest query) {
        return R.ok(workStudyService.listPositions(query));
    }

    @GetMapping("/api/v1/work-study/positions/{id}")
    public R<WorkStudyPosition> positionDetail(@PathVariable Long id) {
        return R.ok(workStudyService.positionDetail(id));
    }

    @PutMapping("/api/v1/work-study/positions/{id}/close")
    public R<Void> closePosition(@PathVariable Long id) {
        workStudyService.closePosition(id);
        return R.ok();
    }

    @PostMapping("/api/v1/work-study/applications")
    public R<WorkStudyApplication> apply(
            @RequestBody @Validated ApplicationCreateRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(workStudyService.apply(req, userId, userName));
    }

    @GetMapping("/api/v1/work-study/applications")
    public R<PageResult<WorkStudyApplication>> listApplications(@Validated ApplicationQueryRequest query) {
        return R.ok(workStudyService.listApplications(query));
    }

    @GetMapping("/api/v1/work-study/applications/{id}")
    public R<WorkStudyApplication> applicationDetail(@PathVariable Long id) {
        return R.ok(workStudyService.applicationDetail(id));
    }

    @PutMapping("/api/v1/work-study/applications/{id}/decide")
    public R<Void> decide(
            @PathVariable Long id,
            @RequestBody @Validated ApplicationDecisionRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        workStudyService.decideApplication(id, req, userId);
        return R.ok();
    }
}
