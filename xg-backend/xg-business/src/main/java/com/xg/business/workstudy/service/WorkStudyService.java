package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import com.xg.business.workstudy.dto.ApplicationCreateRequest;
import com.xg.business.workstudy.dto.ApplicationDecisionRequest;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.PositionCreateRequest;
import com.xg.business.workstudy.dto.PositionQueryRequest;
import com.xg.business.workstudy.dto.TimesheetDisputeRequest;
import com.xg.business.workstudy.dto.TimesheetFinalizeRequest;
import com.xg.business.workstudy.dto.TimesheetReportRequest;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudyTimesheetMapper;
import com.xg.business.workstudy.mapper.WorkStudyYearSettingMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudyTimesheet;
import com.xg.business.workstudy.model.WorkStudyYearSetting;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.form.FormDataValidator;
import com.xg.platform.workflow.form.FormSchema;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudyService {

    private final WorkStudyPositionMapper positionMapper;
    private final WorkStudyApplicationMapper applicationMapper;
    private final WorkStudyTimesheetMapper timesheetMapper;
    private final WorkStudyYearSettingMapper yearSettingMapper;
    private final WorkflowEngine workflowEngine;
    private final WorkflowInstanceMapper workflowInstanceMapper;
    private final TaskInstanceMapper taskInstanceMapper;
    private final SysUserMapper sysUserMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final FormDataValidator formDataValidator;
    private final ObjectMapper objectMapper;

    /** Defaults when a year_setting row is missing for the position's academic_year. */
    private static final int DEFAULT_MAX_FIXED = 1;
    private static final int DEFAULT_MAX_TEMP = 5;

    private String resolveStudentName(Long studentId) {
        SysUser u = sysUserMapper.selectById(studentId);
        if (u == null || u.getRealName() == null || u.getRealName().isBlank()) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        return u.getRealName();
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize workstudy extraData: {}", e.getMessage());
            return null;
        }
    }

    // ==========================================================================
    // Positions
    // ==========================================================================

    @Transactional
    public WorkStudyPosition createPosition(PositionCreateRequest req, Long creatorId) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setTitle(req.getTitle());
        p.setPositionType(req.getPositionType() == null ? "fixed" : req.getPositionType());
        p.setDepartmentName(req.getDepartmentName());
        p.setDescription(req.getDescription());
        p.setRequirements(req.getRequirements());
        p.setPreferFinancialAid(Boolean.TRUE.equals(req.getPreferFinancialAid()));
        p.setHourlyRate(req.getHourlyRate());
        p.setWeeklyHours(req.getWeeklyHours() == null ? 10 : req.getWeeklyHours());
        p.setHeadcount(req.getHeadcount() == null ? 1 : req.getHeadcount());
        p.setHiredCount(0);
        p.setStatus("pending_approval");
        p.setStartDate(req.getStartDate());
        p.setEndDate(req.getEndDate());
        p.setCreatorId(creatorId);

        // V051 expansion
        p.setEmployerId(req.getEmployerId());
        p.setAcademicYear(req.getAcademicYear());
        p.setOwnerUserId(req.getOwnerUserId());
        p.setOwnerPhone(req.getOwnerPhone());
        p.setCampus(req.getCampus());
        p.setWorkLocation(req.getWorkLocation());
        p.setDurationMonths(req.getDurationMonths());
        p.setTimeSlots(toJson(req.getTimeSlots()));
        p.setApplicationDeadline(req.getApplicationDeadline());
        p.setSalaryUnit(req.getSalaryUnit());
        p.setSalaryAmount(req.getSalaryAmount());
        p.setReason(req.getReason());
        p.setGenderLimit(req.getGenderLimit());
        p.setAidLevels(toJson(req.getAidLevels()));
        p.setGradeLimits(toJson(req.getGradeLimits()));
        p.setCollegeLimits(toJson(req.getCollegeLimits()));
        p.setSelfArranged(Boolean.TRUE.equals(req.getSelfArranged()));

        positionMapper.insert(p);

        Map<String, Object> formData = new HashMap<>();
        formData.put("title", p.getTitle());
        formData.put("hourly_rate", p.getHourlyRate());
        formData.put("position_id", p.getId());
        formData.put("creator_id", creatorId);

        try {
            WorkflowInstance instance = workflowEngine.startWorkflowByBizType(
                    "workstudy_position", creatorId,
                    p.getId(), formData, null);
            p.setWorkflowInstanceId(instance.getId());
            positionMapper.updateById(p);
        } catch (Exception e) {
            log.warn("Failed to start position workflow for position {}: {}", p.getId(), e.getMessage());
        }
        return p;
    }

    public PageResult<WorkStudyPosition> listPositions(PositionQueryRequest query) {
        return listPositions(query, null);
    }

    /**
     * Student-scoped list when {@code query.studentScope=true} and {@code currentStudentId != null}:
     * after the SQL page, drop positions whose gender/grade/college/headcount restrictions
     * the student does not satisfy. aid_level filter is intentionally skipped — student profile
     * does not yet store financial aid level (TODO once that field lands).
     */
    public PageResult<WorkStudyPosition> listPositions(PositionQueryRequest query, Long currentStudentId) {
        Page<WorkStudyPosition> page = query.toPage();
        LambdaQueryWrapper<WorkStudyPosition> wrapper = new LambdaQueryWrapper<WorkStudyPosition>()
                .eq(query.getStatus() != null, WorkStudyPosition::getStatus, query.getStatus())
                .eq(query.getPositionType() != null, WorkStudyPosition::getPositionType, query.getPositionType())
                .eq(query.getPreferFinancialAid() != null, WorkStudyPosition::getPreferFinancialAid, query.getPreferFinancialAid())
                .eq(query.getAcademicYear() != null, WorkStudyPosition::getAcademicYear, query.getAcademicYear())
                .eq(query.getEmployerId() != null, WorkStudyPosition::getEmployerId, query.getEmployerId())
                .orderByDesc(WorkStudyPosition::getCreatedAt);
        Page<WorkStudyPosition> pageResult = positionMapper.selectPage(page, wrapper);

        if (Boolean.TRUE.equals(query.getStudentScope()) && currentStudentId != null) {
            StudentEligibility ctx = loadStudentEligibility(currentStudentId);
            List<WorkStudyPosition> filtered = pageResult.getRecords().stream()
                    .filter(p -> isEligible(p, ctx))
                    .toList();
            pageResult.setRecords(filtered);
            // Note: page total is the unfiltered count from SQL — accurate "eligible total"
            // would require a second query; acceptable for student browse UX.
        }
        return PageResult.of(pageResult);
    }

    // ==========================================================================
    // Eligibility (V051): per-student visibility filter on positions
    // ==========================================================================

    record StudentEligibility(String gender, String grade, String college, String aidLevel) {}

    private StudentEligibility loadStudentEligibility(Long studentId) {
        SysUser u = sysUserMapper.selectById(studentId);
        StudentProfile sp = studentProfileMapper.selectOne(new LambdaQueryWrapper<StudentProfile>()
                .eq(StudentProfile::getUserId, studentId));
        return new StudentEligibility(
                u == null ? null : u.getGender(),
                sp == null ? null : sp.getGrade(),
                sp == null ? null : sp.getCollege(),
                sp == null ? null : sp.getAidLevel());
    }

    boolean isEligible(WorkStudyPosition p, StudentEligibility s) {
        // Headcount full → hide
        if (p.getHeadcount() != null && p.getHiredCount() != null
                && p.getHiredCount() >= p.getHeadcount()) {
            return false;
        }
        // Gender restriction
        if (p.getGenderLimit() != null && !p.getGenderLimit().isBlank()
                && s.gender() != null && !p.getGenderLimit().equalsIgnoreCase(s.gender())) {
            return false;
        }
        // Grade / college / aid_level restriction
        if (!matchesJsonStringList(p.getGradeLimits(), s.grade())) return false;
        if (!matchesJsonStringList(p.getCollegeLimits(), s.college())) return false;
        // aid_level: position lists allowed levels; "none" means 不困难也可
        if (!matchesJsonStringList(p.getAidLevels(), s.aidLevel() == null ? "none" : s.aidLevel())) return false;
        return true;
    }

    /**
     * Throws if the student fails any eligibility check OR has reached the per-year
     * in-job limit for the position's type. Called from {@link #apply}.
     */
    void enforceApplyEligibility(WorkStudyPosition pos, Long studentId) {
        StudentEligibility ctx = loadStudentEligibility(studentId);
        if (!isEligible(pos, ctx)) {
            throw WorkStudyErrorCode.POSITION_INELIGIBLE.exception();
        }
        // In-job upper limit (per academic year)
        String year = pos.getAcademicYear();
        if (year == null || year.isBlank()) return;   // legacy positions without a year — skip cap

        WorkStudyYearSetting setting = yearSettingMapper.selectOne(new LambdaQueryWrapper<WorkStudyYearSetting>()
                .eq(WorkStudyYearSetting::getAcademicYear, year));
        int maxFixed = setting == null || setting.getMaxFixedPerStudent() == null
                ? DEFAULT_MAX_FIXED : setting.getMaxFixedPerStudent();
        int maxTemp = setting == null || setting.getMaxTempPerStudent() == null
                ? DEFAULT_MAX_TEMP : setting.getMaxTempPerStudent();

        // Hired-count check uses application.status='hired' joined with position.academic_year + type.
        // Done with two simple queries to avoid a custom SQL mapper.
        boolean isFixed = "fixed".equals(pos.getPositionType());
        int held = countHeldPositions(studentId, year, isFixed ? "fixed" : "temporary");
        if (isFixed && held >= maxFixed) {
            throw WorkStudyErrorCode.STUDENT_FIXED_LIMIT_REACHED.exception();
        }
        if (!isFixed && held >= maxTemp) {
            throw WorkStudyErrorCode.STUDENT_TEMP_LIMIT_REACHED.exception();
        }
    }

    /** How many positions of {@code positionType} this student is currently hired into in {@code year}. */
    private int countHeldPositions(Long studentId, String year, String positionType) {
        List<WorkStudyApplication> hired = applicationMapper.selectList(new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(WorkStudyApplication::getStudentId, studentId)
                .eq(WorkStudyApplication::getStatus, "hired"));
        if (hired.isEmpty()) return 0;
        int n = 0;
        for (WorkStudyApplication a : hired) {
            WorkStudyPosition p = positionMapper.selectById(a.getPositionId());
            if (p == null) continue;
            if (year.equals(p.getAcademicYear()) && positionType.equals(p.getPositionType())) {
                n++;
            }
        }
        return n;
    }

    /** True iff the JSON list is null/empty (no restriction) or contains the student's value. */
    boolean matchesJsonStringList(String jsonList, String value) {
        if (jsonList == null || jsonList.isBlank() || "[]".equals(jsonList.trim())) return true;
        if (value == null) return false;
        try {
            List<?> list = objectMapper.readValue(jsonList, List.class);
            if (list.isEmpty()) return true;
            for (Object item : list) {
                if (value.equals(String.valueOf(item))) return true;
            }
            return false;
        } catch (Exception e) {
            log.warn("Failed to parse position restriction list '{}': {}", jsonList, e.getMessage());
            return true;  // fail-open: bad data shouldn't hide every position
        }
    }

    public WorkStudyPosition positionDetail(Long id) {
        WorkStudyPosition p = positionMapper.selectById(id);
        if (p == null) {
            throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();
        }
        return p;
    }

    @Transactional
    public void closePosition(Long id) {
        WorkStudyPosition p = positionDetail(id);
        p.setStatus("closed");
        positionMapper.updateById(p);
    }

    /**
     * Approve / reject the current pending task on the position's workflow instance.
     * Final {@code position.status} sync is owned by {@code WorkStudyWorkflowListener}
     * — this method only advances the workflow.
     */
    @Transactional
    public void decidePosition(Long positionId, String action, String note, Long operatorId) {
        WorkStudyPosition pos = positionDetail(positionId);
        if (pos.getWorkflowInstanceId() == null) {
            throw new BizException("POSITION_NO_WORKFLOW", "该岗位没有关联工作流");
        }
        TaskInstance task = findPendingTask(pos.getWorkflowInstanceId());
        workflowEngine.handleApproval(task.getId(), action, note, operatorId);
    }

    // ==========================================================================
    // Applications
    // ==========================================================================

    @Transactional
    public WorkStudyApplication apply(ApplicationCreateRequest req, Long studentId) {
        WorkStudyPosition pos = positionDetail(req.getPositionId());
        if (!"open".equals(pos.getStatus())) {
            throw WorkStudyErrorCode.POSITION_CLOSED.exception();
        }
        if (pos.getHiredCount() != null && pos.getHeadcount() != null
                && pos.getHiredCount() >= pos.getHeadcount()) {
            throw WorkStudyErrorCode.POSITION_FULL.exception();
        }
        Long existing = applicationMapper.selectCount(new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(WorkStudyApplication::getPositionId, req.getPositionId())
                .eq(WorkStudyApplication::getStudentId, studentId));
        if (existing != null && existing > 0) {
            throw WorkStudyErrorCode.APPLICATION_ALREADY_EXISTS.exception();
        }
        // V051+V053 — gender/grade/college/aid_level + per-year in-job limit
        enforceApplyEligibility(pos, studentId);

        FormSchema schema = workflowEngine.loadFormSchemaByBizType("workstudy_application");
        formDataValidator.validate(schema, req.getExtraData());

        WorkStudyApplication app = new WorkStudyApplication();
        app.setPositionId(req.getPositionId());
        app.setStudentId(studentId);
        app.setStudentName(resolveStudentName(studentId));
        app.setFinancialAidLevel(req.getFinancialAidLevel());
        app.setIntro(req.getIntro());
        app.setStatus("pending");
        app.setFormData(toJson(req.getExtraData()));
        applicationMapper.insert(app);

        Map<String, Object> formData = new HashMap<>();
        formData.put("position_id", req.getPositionId());
        formData.put("student_id", studentId);
        formData.put("application_id", app.getId());
        formData.put("financial_aid_level", req.getFinancialAidLevel());

        try {
            WorkflowInstance instance = workflowEngine.startWorkflowByBizType(
                    "workstudy_application", studentId,
                    app.getId(), formData, null);
            app.setWorkflowInstanceId(instance.getId());
            applicationMapper.updateById(app);
        } catch (Exception e) {
            log.warn("Failed to start apply workflow for application {}: {}", app.getId(), e.getMessage());
        }
        return app;
    }

    public PageResult<WorkStudyApplication> listApplications(ApplicationQueryRequest query) {
        Page<WorkStudyApplication> page = query.toPage();
        LambdaQueryWrapper<WorkStudyApplication> wrapper = new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(query.getPositionId() != null, WorkStudyApplication::getPositionId, query.getPositionId())
                .eq(query.getStudentId() != null, WorkStudyApplication::getStudentId, query.getStudentId())
                .eq(query.getStatus() != null, WorkStudyApplication::getStatus, query.getStatus())
                .orderByDesc(WorkStudyApplication::getCreatedAt);
        Page<WorkStudyApplication> pageResult = applicationMapper.selectPage(page, wrapper);

        if (query.getInclude() != null && query.getInclude().contains("position")) {
            attachPositionSummaries(pageResult.getRecords());
        }
        return PageResult.of(pageResult);
    }

    /** Batch-fetch positions for the records' unique position_ids and attach a summary to each. */
    private void attachPositionSummaries(List<WorkStudyApplication> apps) {
        if (apps == null || apps.isEmpty()) return;
        java.util.Set<Long> ids = new java.util.HashSet<>();
        for (WorkStudyApplication a : apps) if (a.getPositionId() != null) ids.add(a.getPositionId());
        if (ids.isEmpty()) return;
        List<WorkStudyPosition> positions = positionMapper.selectBatchIds(ids);
        java.util.Map<Long, WorkStudyApplication.PositionSummary> byId = new java.util.HashMap<>();
        for (WorkStudyPosition p : positions) {
            byId.put(p.getId(), new WorkStudyApplication.PositionSummary(
                    p.getId(),
                    p.getTitle(),
                    p.getPositionType(),
                    p.getDepartmentName(),
                    p.getSalaryUnit(),
                    p.getSalaryAmount()
            ));
        }
        for (WorkStudyApplication a : apps) {
            a.setPositionSummary(byId.get(a.getPositionId()));
        }
    }

    public WorkStudyApplication applicationDetail(Long id) {
        WorkStudyApplication app = applicationMapper.selectById(id);
        if (app == null) {
            throw WorkStudyErrorCode.APPLICATION_NOT_FOUND.exception();
        }
        return app;
    }

    /**
     * Position-owner decides on the pending application (1-step in apply_v1 v2).
     * Status maps: {@code "rejected"} → reject, anything else → approve. Final
     * {@code application.status} + {@code position.hired_count} are synced by
     * {@code WorkStudyWorkflowListener} when the workflow instance terminates.
     */
    @Transactional
    public void decideApplication(Long id, ApplicationDecisionRequest req, Long deciderId) {
        WorkStudyApplication app = applicationDetail(id);
        if (app.getWorkflowInstanceId() == null) {
            throw new BizException("APPLICATION_NO_WORKFLOW", "该申请没有关联工作流");
        }
        if (!"pending".equals(app.getStatus())) {
            throw WorkStudyErrorCode.APPLICATION_ALREADY_DECIDED.exception();
        }
        String action = "rejected".equals(req.getStatus()) ? "reject" : "approve";
        TaskInstance task = findPendingTask(app.getWorkflowInstanceId());
        workflowEngine.handleApproval(task.getId(), action, req.getDecisionNote(), deciderId);

        app.setDecisionNote(req.getDecisionNote());
        app.setDecidedBy(deciderId);
        app.setDecidedAt(OffsetDateTime.now());
        applicationMapper.updateById(app);
    }

    // ==========================================================================
    // Timesheets
    // ==========================================================================

    @Transactional
    public WorkStudyTimesheet reportTimesheet(TimesheetReportRequest req, Long reporterId) {
        WorkStudyApplication app = applicationDetail(req.getApplicationId());
        if (!"hired".equals(app.getStatus())) {
            throw WorkStudyErrorCode.APPLICATION_NOT_HIRED.exception();
        }
        Long existing = timesheetMapper.selectCount(new LambdaQueryWrapper<WorkStudyTimesheet>()
                .eq(WorkStudyTimesheet::getApplicationId, req.getApplicationId())
                .eq(WorkStudyTimesheet::getMonth, req.getMonth()));
        if (existing != null && existing > 0) {
            throw WorkStudyErrorCode.TIMESHEET_ALREADY_REPORTED.exception();
        }

        WorkStudyTimesheet t = new WorkStudyTimesheet();
        t.setApplicationId(app.getId());
        t.setStudentId(app.getStudentId());
        t.setPositionId(app.getPositionId());
        t.setMonth(req.getMonth());
        t.setHoursReported(req.getHoursReported());
        t.setStatus("pending_confirm");
        t.setReporterId(reporterId);
        timesheetMapper.insert(t);

        Map<String, Object> formData = new HashMap<>();
        formData.put("timesheet_id", t.getId());
        formData.put("application_id", app.getId());
        formData.put("student_id", app.getStudentId());
        formData.put("month", t.getMonth());
        formData.put("hours_reported", t.getHoursReported());

        try {
            // initiator = student so student+self assignee resolution works
            WorkflowInstance instance = workflowEngine.startWorkflowByBizType(
                    "workstudy_timesheet", app.getStudentId(),
                    t.getId(), formData, null);
            t.setWorkflowInstanceId(instance.getId());
            timesheetMapper.updateById(t);
        } catch (Exception e) {
            log.warn("Failed to start timesheet workflow for timesheet {}: {}", t.getId(), e.getMessage());
        }
        return t;
    }

    public PageResult<WorkStudyTimesheet> listTimesheets(Long studentId, Long positionId, String status, String month,
                                                         Integer page, Integer size) {
        Page<WorkStudyTimesheet> p = new Page<>(page == null ? 1 : page, size == null ? 20 : size);
        LambdaQueryWrapper<WorkStudyTimesheet> wrapper = new LambdaQueryWrapper<WorkStudyTimesheet>()
                .eq(studentId != null, WorkStudyTimesheet::getStudentId, studentId)
                .eq(positionId != null, WorkStudyTimesheet::getPositionId, positionId)
                .eq(status != null, WorkStudyTimesheet::getStatus, status)
                .eq(month != null, WorkStudyTimesheet::getMonth, month)
                .orderByDesc(WorkStudyTimesheet::getCreatedAt);
        return PageResult.of(timesheetMapper.selectPage(p, wrapper));
    }

    public WorkStudyTimesheet timesheetDetail(Long id) {
        WorkStudyTimesheet t = timesheetMapper.selectById(id);
        if (t == null) {
            throw WorkStudyErrorCode.TIMESHEET_NOT_FOUND.exception();
        }
        return t;
    }

    @Transactional
    public void studentConfirmTimesheet(Long id, Long studentId) {
        WorkStudyTimesheet t = timesheetDetail(id);
        if (!"pending_confirm".equals(t.getStatus())) {
            throw WorkStudyErrorCode.TIMESHEET_NOT_PENDING_CONFIRM.exception();
        }
        if (!studentId.equals(t.getStudentId())) {
            throw new BizException("TIMESHEET_FORBIDDEN", "只能确认自己的工时");
        }
        if (t.getWorkflowInstanceId() == null) {
            throw new BizException("TIMESHEET_NO_WORKFLOW", "该工时没有关联工作流");
        }

        TaskInstance task = findPendingTask(t.getWorkflowInstanceId());
        workflowEngine.handleApproval(task.getId(), "approve", null, studentId);

        t.setStatus("confirmed");
        t.setHoursConfirmed(t.getHoursReported());
        t.setHoursFinal(t.getHoursReported());
        t.setStudentConfirmedAt(OffsetDateTime.now());
        timesheetMapper.updateById(t);
    }

    @Transactional
    public void disputeTimesheet(Long id, TimesheetDisputeRequest req, Long studentId) {
        WorkStudyTimesheet t = timesheetDetail(id);
        if (!"pending_confirm".equals(t.getStatus())) {
            throw WorkStudyErrorCode.TIMESHEET_NOT_PENDING_CONFIRM.exception();
        }
        if (!studentId.equals(t.getStudentId())) {
            throw new BizException("TIMESHEET_FORBIDDEN", "只能异议自己的工时");
        }
        if (t.getWorkflowInstanceId() == null) {
            throw new BizException("TIMESHEET_NO_WORKFLOW", "该工时没有关联工作流");
        }

        TaskInstance task = findPendingTask(t.getWorkflowInstanceId());
        workflowEngine.handleApproval(task.getId(), "reject", req.getNote(), studentId);

        t.setStatus("disputed");
        t.setDisputeNote(req.getNote());
        timesheetMapper.updateById(t);
    }

    @Transactional
    public void finalizeTimesheet(Long id, TimesheetFinalizeRequest req, Long officerId) {
        WorkStudyTimesheet t = timesheetDetail(id);
        if (!"disputed".equals(t.getStatus())) {
            throw WorkStudyErrorCode.TIMESHEET_NOT_DISPUTED.exception();
        }
        if (t.getWorkflowInstanceId() == null) {
            throw new BizException("TIMESHEET_NO_WORKFLOW", "该工时没有关联工作流");
        }

        TaskInstance task = findPendingTask(t.getWorkflowInstanceId());
        if (!"officer_finalize".equals(task.getNodeId())) {
            throw WorkStudyErrorCode.TIMESHEET_NOT_DISPUTED.exception();
        }
        workflowEngine.handleApproval(task.getId(), "approve", req.getNote(), officerId);

        t.setStatus("finalized");
        t.setHoursFinal(req.getHoursFinal());
        t.setFinalizeNote(req.getNote());
        timesheetMapper.updateById(t);
    }

    // ==========================================================================
    // Helpers
    // ==========================================================================

    private TaskInstance findPendingTask(Long workflowInstanceId) {
        List<TaskInstance> tasks = taskInstanceMapper.selectList(new LambdaQueryWrapper<TaskInstance>()
                .eq(TaskInstance::getWorkflowInstanceId, workflowInstanceId)
                .eq(TaskInstance::getStatus, "pending")
                .orderByAsc(TaskInstance::getId));
        if (tasks.isEmpty()) {
            throw WorkStudyErrorCode.WORKFLOW_NO_PENDING_TASK.exception();
        }
        return tasks.get(0);
    }
}
