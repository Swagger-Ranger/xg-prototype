package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.ApplicationCreateRequest;
import com.xg.business.workstudy.dto.ApplicationDecisionRequest;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.BatchActionResult;
import com.xg.business.workstudy.dto.BatchNotifyRequest;
import com.xg.business.workstudy.dto.BatchOffboardRequest;
import com.xg.business.workstudy.dto.OffboardByEmployerRequest;
import com.xg.business.workstudy.dto.OffboardByStudentRequest;
import com.xg.business.workstudy.dto.PositionCreateRequest;
import com.xg.business.workstudy.dto.PositionQueryRequest;
import com.xg.business.workstudy.dto.PositionRecommendation;
import com.xg.business.workstudy.dto.SalaryDecisionRequest;
import com.xg.business.workstudy.dto.ScheduleInterviewRequest;
import com.xg.business.workstudy.dto.SalaryQueryRequest;
import com.xg.business.workstudy.dto.SalarySubmitRequest;
import com.xg.business.workstudy.dto.TimesheetDisputeRequest;
import com.xg.business.workstudy.dto.TimesheetFinalizeRequest;
import com.xg.business.workstudy.dto.TimesheetReportRequest;
import com.xg.business.workstudy.dto.WorkStudyReportDsl;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.business.workstudy.model.WorkStudyTimesheet;
import com.xg.business.workstudy.service.WorkStudyExportService;
import com.xg.business.workstudy.service.WorkStudyRecommendationService;
import com.xg.business.workstudy.service.WorkStudySalarySettlementService;
import com.xg.business.workstudy.service.WorkStudySalaryService;
import com.xg.business.workstudy.service.WorkStudyService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpUtil;
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
    private final WorkStudyRecommendationService recommendationService;
    private final WorkStudyExportService exportService;
    private final AssigneeLookupMapper roleLookup;

    private static final Set<String> AID_CENTER_ROLES = Set.of("aid_center_officer", "student_affairs_officer", "school_admin");

    private static final Set<String> SALARY_OPS_ROLES = Set.of("student_affairs_officer", "school_admin");

    /** A3 批量动作的粗粒度 gate；细粒度（"是否岗位负责人"）由 service 逐条判断。 */
    private static final Set<String> BATCH_OPS_ROLES = Set.of(
            "school_admin", "student_affairs_officer", "employer");

    // --- Positions -----------------------------------------------------------

    @PostMapping("/api/v1/work-study/positions")
    @SaCheckPermission("workstudy:position:setup")
    public R<WorkStudyPosition> createPosition(
            @RequestBody @Validated PositionCreateRequest req) {
        Long userId = CurrentUser.id();
        // 学工处 / 校管理员（workstudy:employer:manage）可代任意单位发布；employer 角色须归属其本单位。
        boolean bypassOwnership = StpUtil.hasPermission("workstudy:employer:manage");
        return R.ok(workStudyService.createPosition(req, userId, bypassOwnership));
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
    @SaCheckPermission("workstudy:position:manage")
    public R<Void> closePosition(@PathVariable Long id) {
        Long userId = CurrentUser.id();
        boolean bypassOwnership = StpUtil.hasPermission("workstudy:employer:manage");
        workStudyService.closePosition(id, userId, bypassOwnership);
        return R.ok();
    }

    /** A1 暂停 / 恢复招新（status 不动）。{@code accepting=false} 时可附 {@code reason}。 */
    @PutMapping("/api/v1/work-study/positions/{id}/accepting-applications")
    @SaCheckPermission("workstudy:position:manage")
    public R<Void> setAcceptingApplications(
            @PathVariable Long id,
            @RequestParam boolean accepting,
            @RequestParam(required = false) String reason) {
        Long userId = CurrentUser.id();
        boolean bypassOwnership = StpUtil.hasPermission("workstudy:employer:manage");
        workStudyService.togglePositionAccepting(id, accepting, reason, userId, bypassOwnership);
        return R.ok();
    }

    /**
     * Officer approves (action=approve) or rejects (action=reject) a pending position-approval task.
     * 工作流引擎内部会按 taskInstance.assignee 二次校验当前用户是否为该任务受理人。
     */
    @PutMapping("/api/v1/work-study/positions/{id}/decide")
    @SaCheckPermission("workstudy:position:approve")
    public R<Void> decidePosition(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestParam(required = false) String note) {
        Long userId = CurrentUser.id();
        workStudyService.decidePosition(id, action, note, userId);
        return R.ok();
    }

    /** B3 学生侧 "为你推荐" — Java 评分 + AI 理由的混合推荐。失败时降级为只返回评分排序无理由。 */
    @GetMapping("/api/v1/work-study/me/recommended-positions")
    public R<List<PositionRecommendation>> myRecommendedPositions(
            @RequestParam(defaultValue = "5") int topK) {
        Long userId = CurrentUser.id();
        return R.ok(recommendationService.recommendForStudent(userId, topK));
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
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        // 学生只能看自己的申请；防越权 + 避免「我的申请」tab 把全校申请都堆出来。
        // employer / 学工 / 校管理员保持原行为（FE 决定 scope）。
        if (roles.contains("student")) {
            query.setStudentId(userId);
        }
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

    /** 用人单位（岗位负责人）/ 学工处 / 校级管理员 主动让在岗学生离岗。 */
    @PostMapping("/api/v1/work-study/applications/{id}/offboard-by-employer")
    public R<Void> offboardByEmployer(
            @PathVariable Long id,
            @RequestBody @Validated OffboardByEmployerRequest req) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        workStudyService.assertEmployerOffboardAuthority(id, userId, roles);
        workStudyService.offboardByEmployer(id, req, userId);
        return R.ok();
    }

    /** 学生主动从自己当前在岗的勤工岗位离岗。 */
    @PostMapping("/api/v1/work-study/applications/{id}/offboard-by-student")
    public R<Void> offboardByStudent(
            @PathVariable Long id,
            @RequestBody @Validated OffboardByStudentRequest req) {
        Long userId = CurrentUser.id();
        workStudyService.offboardByStudent(id, req, userId);
        return R.ok();
    }

    /** A3 批量终止上岗。Service 逐条做岗位负责人 / 状态校验，跳过失败的，返回汇总。 */
    @PostMapping("/api/v1/work-study/applications/batch/offboard")
    public R<BatchActionResult> batchOffboard(
            @RequestBody @Validated BatchOffboardRequest req) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(BATCH_OPS_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "无权执行批量操作");
        }
        return R.ok(workStudyService.batchOffboard(req, userId, roles));
    }

    /** A3 批量给选中申请的学生发站内信。Service 逐条做岗位负责人校验。 */
    @PostMapping("/api/v1/work-study/applications/batch/notify")
    public R<BatchActionResult> batchNotify(
            @RequestBody @Validated BatchNotifyRequest req) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(BATCH_OPS_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "无权执行批量操作");
        }
        return R.ok(workStudyService.batchNotify(req, userId, roles));
    }

    /**
     * B2 发送面试通知：记录时间/地点/内部备注 + Orchestrator 走 INTERVIEW_INVITE 模板下发。
     * 权限与 employer 端离岗相同（岗位负责人 + 学工处 / 校级管理员）。
     */
    @PostMapping("/api/v1/work-study/applications/{id}/schedule-interview")
    public R<Void> scheduleInterview(
            @PathVariable Long id,
            @RequestBody @Validated ScheduleInterviewRequest req) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        workStudyService.assertEmployerOffboardAuthority(id, userId, roles);
        workStudyService.scheduleInterview(id, req, userId);
        return R.ok();
    }

    // --- Export (A4) ---------------------------------------------------------

    /** A4 — 导出申请当前视图（按筛选条件）。 */
    @GetMapping("/api/v1/work-study/export/applications")
    public org.springframework.http.ResponseEntity<byte[]> exportApplicationsCurrentView(
            @Validated ApplicationQueryRequest query) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(BATCH_OPS_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "无权导出");
        }
        byte[] xlsx = exportService.exportApplicationsCurrentView(query);
        return xlsxResponse("workstudy_applications", xlsx);
    }

    /** A4 — 按 AI 解析出的 DSL 导出。 */
    @PostMapping("/api/v1/work-study/export/nl-report")
    public org.springframework.http.ResponseEntity<byte[]> exportNlReport(
            @RequestBody @Validated WorkStudyReportDsl dsl) {
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(BATCH_OPS_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "无权导出");
        }
        byte[] xlsx = exportService.exportByDsl(dsl);
        String filenameBase = dsl.getTitle() == null || dsl.getTitle().isBlank()
                ? "workstudy_report" : dsl.getTitle();
        return xlsxResponse(filenameBase, xlsx);
    }

    private static org.springframework.http.ResponseEntity<byte[]> xlsxResponse(String filenameBase, byte[] data) {
        String stamp = java.time.LocalDate.now().toString();
        String filename = filenameBase + "_" + stamp + ".xlsx";
        // RFC 5987: UTF-8 filename* 段，避免浏览器对中文乱码
        String encoded = java.net.URLEncoder.encode(filename, java.nio.charset.StandardCharsets.UTF_8)
                .replace("+", "%20");
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set("Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        headers.set("Content-Disposition",
                "attachment; filename=\"export.xlsx\"; filename*=UTF-8''" + encoded);
        headers.set("Content-Length", String.valueOf(data.length));
        return new org.springframework.http.ResponseEntity<>(data, headers, org.springframework.http.HttpStatus.OK);
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
        Long userId = CurrentUser.id();
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        // 学生只能看自己的薪资。employer 角色（非 admin）的"本单位"过滤由 service 兜底，不再依赖前端 scope。
        if (roles.contains("student")) {
            query.setStudentId(userId);
        }
        return R.ok(salaryService.list(query, userId, roles));
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
