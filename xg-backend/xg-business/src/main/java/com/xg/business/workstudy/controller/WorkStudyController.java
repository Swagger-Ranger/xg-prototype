package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.ApplicationCreateRequest;
import com.xg.business.workstudy.dto.ApplicationDecisionRequest;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.PositionCreateRequest;
import com.xg.business.workstudy.dto.PositionQueryRequest;
import com.xg.business.workstudy.dto.SalaryDecisionRequest;
import com.xg.business.workstudy.dto.SalaryQueryRequest;
import com.xg.business.workstudy.dto.SalarySubmitRequest;
import com.xg.business.workstudy.dto.TimesheetDisputeRequest;
import com.xg.business.workstudy.dto.TimesheetFinalizeRequest;
import com.xg.business.workstudy.dto.TimesheetReportRequest;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.business.workstudy.model.WorkStudyTimesheet;
import com.xg.business.workstudy.service.WorkStudySalarySettlementService;
import com.xg.business.workstudy.service.WorkStudySalaryService;
import com.xg.business.workstudy.service.WorkStudyService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@Slf4j
@RestController
@RequiredArgsConstructor
public class WorkStudyController {

    private final WorkStudyService workStudyService;
    private final WorkStudySalarySettlementService salarySettlementService;
    private final WorkStudySalaryService salaryService;
    private final AssigneeLookupMapper roleLookup;

    private static final Set<String> AID_CENTER_ROLES = Set.of("aid_center_officer", "student_affairs_officer", "school_admin");

    private static final Set<String> SALARY_OPS_ROLES = Set.of("student_affairs_officer", "school_admin");

    // --- Positions -----------------------------------------------------------

    @PostMapping("/api/v1/work-study/positions")
    public R<WorkStudyPosition> createPosition(
            @RequestBody @Validated PositionCreateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(workStudyService.createPosition(req, userId));
    }

    @GetMapping("/api/v1/work-study/positions")
    public R<PageResult<WorkStudyPosition>> listPositions(
            @Validated PositionQueryRequest query) {
        Long userId = CurrentUser.idOrNull();
        return R.ok(workStudyService.listPositions(query, userId));
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

    /**
     * Officer approves (action=approve) or rejects (action=reject) a pending position-approval task.
     */
    @PutMapping("/api/v1/work-study/positions/{id}/decide")
    public R<Void> decidePosition(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestParam(required = false) String note) {
        Long userId = CurrentUser.id();
        workStudyService.decidePosition(id, action, note, userId);
        return R.ok();
    }

    // --- Applications --------------------------------------------------------

    @PostMapping("/api/v1/work-study/applications")
    public R<WorkStudyApplication> apply(
            @RequestBody @Validated ApplicationCreateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(workStudyService.apply(req, userId));
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
            @RequestBody @Validated ApplicationDecisionRequest req) {
        Long userId = CurrentUser.id();
        workStudyService.decideApplication(id, req, userId);
        return R.ok();
    }

    // --- Timesheets ----------------------------------------------------------

    @PostMapping("/api/v1/work-study/timesheets")
    public R<WorkStudyTimesheet> reportTimesheet(
            @RequestBody @Validated TimesheetReportRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(workStudyService.reportTimesheet(req, userId));
    }

    @GetMapping("/api/v1/work-study/timesheets")
    public R<PageResult<WorkStudyTimesheet>> listTimesheets(
            @RequestParam(required = false) Long studentId,
            @RequestParam(required = false) Long positionId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return R.ok(workStudyService.listTimesheets(studentId, positionId, status, month, page, size));
    }

    @GetMapping("/api/v1/work-study/timesheets/{id}")
    public R<WorkStudyTimesheet> timesheetDetail(@PathVariable Long id) {
        return R.ok(workStudyService.timesheetDetail(id));
    }

    @PostMapping("/api/v1/work-study/timesheets/{id}/student-confirm")
    public R<Void> studentConfirmTimesheet(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        workStudyService.studentConfirmTimesheet(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/work-study/timesheets/{id}/dispute")
    public R<Void> disputeTimesheet(
            @PathVariable Long id,
            @RequestBody @Validated TimesheetDisputeRequest req) {
        Long userId = CurrentUser.id();
        workStudyService.disputeTimesheet(id, req, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/work-study/timesheets/{id}/finalize")
    public R<Void> finalizeTimesheet(
            @PathVariable Long id,
            @RequestBody @Validated TimesheetFinalizeRequest req) {
        Long userId = CurrentUser.id();
        workStudyService.finalizeTimesheet(id, req, userId);
        return R.ok();
    }

    /**
     * Manual trigger to run salary settlement across all tenants right now —
     * mirrors the daily 03:00 cron. Returns how many salary rows were inserted.
     * Intended for ops/demo; the scheduled run is authoritative in production.
     */
    @PostMapping("/api/v1/work-study/salary/settle")
    public R<Integer> settleSalary() {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(SALARY_OPS_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可触发工资结算");
        }
        return R.ok(salarySettlementService.runOnce("manual"));
    }

    // --- Salary submission & approval (1007 workflow) -----------------------

    /** 用工单位申报某学生在某月的薪资。月内可多次申报。 */
    @PostMapping("/api/v1/work-study/salaries")
    public R<WorkStudySalary> submitSalary(
            @RequestBody @Validated SalarySubmitRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(salaryService.submit(req, userId));
    }

    @GetMapping("/api/v1/work-study/salaries")
    public R<PageResult<WorkStudySalary>> listSalaries(@Validated SalaryQueryRequest query) {
        return R.ok(salaryService.list(query));
    }

    @GetMapping("/api/v1/work-study/salaries/{id}")
    public R<WorkStudySalary> salaryDetail(@PathVariable Long id) {
        return R.ok(salaryService.detail(id));
    }

    /** 资助中心审批薪资。action = approve / reject。 */
    @PutMapping("/api/v1/work-study/salaries/{id}/decide")
    public R<Void> decideSalary(
            @PathVariable Long id,
            @RequestBody @Validated SalaryDecisionRequest req) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(AID_CENTER_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅资助中心 / 学工处 / 校级管理员可审批薪资");
        }
        salaryService.decide(id, req, userId);
        return R.ok();
    }
}
