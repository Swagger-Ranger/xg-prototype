package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
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
import com.xg.business.workstudy.dto.ScheduleInterviewRequest;
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
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
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
    private final NotificationService notificationService;
    private final NotificationOrchestrator notificationOrchestrator;
    private final EmployerService employerService;

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

    /**
     * 岗位创建归属校验。{@code bypassOwnership=true}（学工处 / 校管理员）跳过 creator
     * 与 employer 的归属判断，但 ownerUserId 若指定仍必须属于该 employer。
     */
    private void assertCanCreateForEmployer(Long employerId, Long ownerUserId, Long creatorId, boolean bypassOwnership) {
        if (!bypassOwnership) {
            if (employerId == null) {
                throw new BizException("EMPLOYER_REQUIRED", "请选择所属用人单位");
            }
            if (!employerService.isUserOperatorOrLeader(employerId, creatorId)) {
                throw new BizException("FORBIDDEN", "你不是该用人单位的负责人或操作员，无权发起岗位");
            }
        }
        if (employerId != null && ownerUserId != null
                && !employerService.isUserOperatorOrLeader(employerId, ownerUserId)) {
            throw new BizException("OWNER_NOT_IN_EMPLOYER", "岗位负责人不属于所选用人单位");
        }
    }

    @Transactional
    public WorkStudyPosition createPosition(PositionCreateRequest req, Long creatorId, boolean bypassOwnership) {
        assertCanCreateForEmployer(req.getEmployerId(), req.getOwnerUserId(), creatorId, bypassOwnership);
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
        // B3 困难生策略；null → 'none'
        p.setFinancialAidPolicy(req.getFinancialAidPolicy() != null ? req.getFinancialAidPolicy() : "none");
        p.setReservedCount(req.getReservedCount());

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
            // 批查 disabled employer，避免 N+1。已禁用单位的岗位对学生不可见。
            java.util.Set<Long> employerIds = pageResult.getRecords().stream()
                    .map(WorkStudyPosition::getEmployerId)
                    .filter(java.util.Objects::nonNull)
                    .collect(java.util.stream.Collectors.toSet());
            java.util.Set<Long> disabledEmployerIds = employerService.findDisabledEmployerIds(employerIds);
            List<WorkStudyPosition> filtered = pageResult.getRecords().stream()
                    .filter(p -> p.getEmployerId() == null || !disabledEmployerIds.contains(p.getEmployerId()))
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
        // A1 暂停招新 → 学生侧隐藏（admin/employer 视角仍可见）
        if (Boolean.FALSE.equals(p.getAcceptingApplications())) {
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

    /**
     * 岗位级操作归属校验（close / toggleAccepting 等"动该岗位"的端点共用）。
     * bypassOwnership=true（学工处 / 校管理员）直接通过；否则要求 userId ∈ 该岗位 employer 的 leader/operator。
     * legacy 岗位 employer_id 为空时，非 admin 一律拒绝（无法判定归属，从严）。
     */
    private void assertCanOperatePosition(WorkStudyPosition p, Long userId, boolean bypassOwnership) {
        if (bypassOwnership) return;
        if (p.getEmployerId() == null) {
            throw new BizException("FORBIDDEN", "该岗位无所属单位，仅学工处 / 校管理员可操作");
        }
        if (!employerService.isUserOperatorOrLeader(p.getEmployerId(), userId)) {
            throw new BizException("FORBIDDEN", "你不是该岗位所属单位的负责人或操作员");
        }
    }

    @Transactional
    public void closePosition(Long id, Long userId, boolean bypassOwnership) {
        WorkStudyPosition p = positionDetail(id);
        assertCanOperatePosition(p, userId, bypassOwnership);
        p.setStatus("closed");
        positionMapper.updateById(p);
    }

    /** A1 — toggle 暂停 / 恢复招新。仅在 status='open' 时有意义，但本方法不做 status 校验。 */
    @Transactional
    public void togglePositionAccepting(Long positionId, boolean accepting, String reason, Long userId, boolean bypassOwnership) {
        WorkStudyPosition p = positionDetail(positionId);
        assertCanOperatePosition(p, userId, bypassOwnership);
        p.setAcceptingApplications(accepting);
        p.setPausedReason(accepting ? null : reason);
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
        if (Boolean.FALSE.equals(pos.getAcceptingApplications())) {
            throw WorkStudyErrorCode.POSITION_NOT_ACCEPTING.exception();
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
        // B3 — 'only' 策略强校验：非困难生不能申请
        if ("only".equals(pos.getFinancialAidPolicy())) {
            StudentEligibility ctx = loadStudentEligibility(studentId);
            String aid = ctx.aidLevel();
            if (aid == null || aid.isBlank() || "none".equalsIgnoreCase(aid)) {
                throw WorkStudyErrorCode.POSITION_AID_ONLY.exception();
            }
        }

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
    // Batch actions (A3) — 批量终止 + 批量发通知。续签不在 P0 范围（数据模型缺
    // engagement_end_date，无法语义化）。每个 application 独立尝试，授权失败 /
    // 状态不合法的跳过，返回汇总。
    // ==========================================================================

    @Transactional
    public BatchActionResult batchOffboard(BatchOffboardRequest req, Long operatorId, List<String> operatorRoles) {
        BatchActionResult result = new BatchActionResult();
        boolean isAdmin = operatorRoles != null && operatorRoles.stream()
                .anyMatch(r -> "school_admin".equals(r) || "student_affairs_officer".equals(r));
        String resolvedReason = "completed".equals(req.getReason()) ? "completed" : "terminated_by_employer";

        for (Long applicationId : req.getApplicationIds()) {
            try {
                WorkStudyApplication app = applicationMapper.selectById(applicationId);
                if (app == null) {
                    result.addFailure(applicationId, "NOT_FOUND", "申请不存在");
                    continue;
                }
                WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
                if (pos == null) {
                    result.addFailure(applicationId, "POSITION_NOT_FOUND", "岗位不存在");
                    continue;
                }
                if (!isAdmin && !operatorId.equals(pos.getOwnerUserId())) {
                    result.setSkipped(result.getSkipped() + 1);
                    continue;
                }
                if (!"on_duty".equals(app.getEngagementStatus())) {
                    result.setSkipped(result.getSkipped() + 1);
                    continue;
                }
                doOffboard(app, pos, resolvedReason, req.getNote(), operatorId);
                notifyOffboardToStudent(app, pos, resolvedReason);
                result.setSucceeded(result.getSucceeded() + 1);
            } catch (Exception e) {
                log.warn("batchOffboard failed application_id={}: {}", applicationId, e.getMessage());
                result.addFailure(applicationId, "ERROR", e.getMessage());
            }
        }
        return result;
    }

    /**
     * 批量给选中申请的学生发 ad-hoc 站内信。直接走 NotificationService（不走 Orchestrator）：
     * Orchestrator 的 (source_type, source_id, template_code) 去重设计与"同一对象多次广播"
     * 语义冲突，绕开后避免假性 dedup。
     */
    public BatchActionResult batchNotify(BatchNotifyRequest req, Long operatorId, List<String> operatorRoles) {
        BatchActionResult result = new BatchActionResult();
        boolean isAdmin = operatorRoles != null && operatorRoles.stream()
                .anyMatch(r -> "school_admin".equals(r) || "student_affairs_officer".equals(r));

        for (Long applicationId : req.getApplicationIds()) {
            try {
                WorkStudyApplication app = applicationMapper.selectById(applicationId);
                if (app == null) {
                    result.addFailure(applicationId, "NOT_FOUND", "申请不存在");
                    continue;
                }
                if (app.getStudentId() == null) {
                    result.addFailure(applicationId, "NO_STUDENT", "申请无学生 ID");
                    continue;
                }
                WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
                if (!isAdmin && (pos == null || !operatorId.equals(pos.getOwnerUserId()))) {
                    result.setSkipped(result.getSkipped() + 1);
                    continue;
                }
                SendNotificationRequest sendReq = new SendNotificationRequest();
                sendReq.setSourceType("workstudy_application");
                sendReq.setSourceId(app.getId());
                sendReq.setRecipientUserIds(List.of(app.getStudentId()));
                sendReq.setChannels(List.of("in_app"));
                sendReq.setTitle(req.getTitle());
                sendReq.setContent(req.getBody());
                sendReq.setLevel("normal");
                notificationService.send(sendReq);
                result.setSucceeded(result.getSucceeded() + 1);
            } catch (Exception e) {
                log.warn("batchNotify failed application_id={}: {}", applicationId, e.getMessage());
                result.addFailure(applicationId, "ERROR", e.getMessage());
            }
        }
        return result;
    }

    // ==========================================================================
    // Interview notice (B2) — employer fills time/location, AI/employer drafts
    // body, Orchestrator dispatches via 3-channel default. Authority is enforced
    // by the controller (same authority surface as employer-side offboarding).
    // ==========================================================================

    @Transactional
    public void scheduleInterview(Long applicationId, ScheduleInterviewRequest req, Long operatorId) {
        WorkStudyApplication app = applicationDetail(applicationId);
        if (!"pending".equals(app.getStatus()) && !"recommended".equals(app.getStatus())) {
            throw WorkStudyErrorCode.INTERVIEW_INVALID_STATE.exception();
        }
        if (req.getBody() == null || req.getBody().isBlank()) {
            throw WorkStudyErrorCode.INTERVIEW_BODY_REQUIRED.exception();
        }
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null) throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();

        OffsetDateTime now = OffsetDateTime.now();
        app.setInterviewAt(req.getInterviewAt());
        app.setInterviewLocation(req.getInterviewLocation());
        app.setInterviewNotes(req.getInterviewNotes());
        app.setInterviewNotifiedAt(now);
        applicationMapper.updateById(app);

        // Orchestrator path: template = INTERVIEW_INVITE, body透传 via {{body}} var.
        // Recipient (applicant=student) is decided by template's recipients JSONB.
        if (app.getStudentId() != null) {
            Map<String, Object> vars = new HashMap<>();
            vars.put("position_title", pos.getTitle() != null ? pos.getTitle() : "勤工岗位");
            vars.put("body", req.getBody());
            try {
                notificationOrchestrator.send(
                        "INTERVIEW_INVITE", "workstudy_application", app.getId(),
                        RecipientContext.applicant(app.getStudentId()), vars);
            } catch (Exception e) {
                log.warn("send INTERVIEW_INVITE failed application_id={}: {}", app.getId(), e.getMessage());
            }
        }
    }

    // ==========================================================================
    // Offboarding (A2) — direct action, no workflow. Authority is enforced by the
    // controller (role / ownership check). doOffboard() trusts the caller.
    // ==========================================================================

    /** Employer terminates or marks a student's engagement as completed. */
    @Transactional
    public void offboardByEmployer(Long applicationId, OffboardByEmployerRequest req, Long operatorId) {
        WorkStudyApplication app = applicationDetail(applicationId);
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null) throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();
        String resolved = "completed".equals(req.getReason()) ? "completed" : "terminated_by_employer";
        doOffboard(app, pos, resolved, req.getNote(), operatorId);
        notifyOffboardToStudent(app, pos, resolved);
    }

    /** Student resigns from their current engagement. */
    @Transactional
    public void offboardByStudent(Long applicationId, OffboardByStudentRequest req, Long studentId) {
        WorkStudyApplication app = applicationDetail(applicationId);
        if (!studentId.equals(app.getStudentId())) {
            throw WorkStudyErrorCode.OFFBOARD_FORBIDDEN.exception();
        }
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null) throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();
        doOffboard(app, pos, "resigned_by_student", req.getNote(), studentId);
        notifyOffboardToEmployer(app, pos);
    }

    private void doOffboard(WorkStudyApplication app, WorkStudyPosition pos,
                            String reason, String note, Long operatorId) {
        if (!"on_duty".equals(app.getEngagementStatus())) {
            throw WorkStudyErrorCode.APPLICATION_NOT_ON_DUTY.exception();
        }
        app.setEngagementStatus("offboarded");
        app.setOffboardedAt(OffsetDateTime.now());
        app.setOffboardReason(reason);
        app.setOffboardNote(note);
        app.setOffboardOperatorId(operatorId);
        applicationMapper.updateById(app);

        // hired_count -= 1; intentionally do NOT toggle position.status — cannot
        // reliably distinguish "manually closed" from "auto-closed when full",
        // so leave any reopen decision to the employer.
        if (pos.getHiredCount() != null && pos.getHiredCount() > 0) {
            pos.setHiredCount(pos.getHiredCount() - 1);
            positionMapper.updateById(pos);
        }
    }

    /** Authority check used by the controller for employer-side offboard. */
    public void assertEmployerOffboardAuthority(Long applicationId, Long operatorId, List<String> operatorRoles) {
        WorkStudyApplication app = applicationDetail(applicationId);
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null) throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();
        if (operatorId.equals(pos.getOwnerUserId())) return;
        if (operatorRoles != null && operatorRoles.stream()
                .anyMatch(r -> "school_admin".equals(r) || "student_affairs_officer".equals(r))) {
            return;
        }
        throw WorkStudyErrorCode.OFFBOARD_FORBIDDEN.exception();
    }

    private void notifyOffboardToStudent(WorkStudyApplication app, WorkStudyPosition pos, String reason) {
        if (app.getStudentId() == null) return;
        String title = pos.getTitle() != null ? pos.getTitle() : "勤工岗位";
        String reasonLabel = "completed".equals(reason) ? "任期已满" : "用人单位终止上岗";
        StringBuilder body = new StringBuilder(String.format("您在「%s」岗位的工作已结束（%s）。", title, reasonLabel));
        if (app.getOffboardNote() != null && !app.getOffboardNote().isBlank()) {
            body.append("说明：").append(app.getOffboardNote());
        }
        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("workstudy_application");
        req.setSourceId(app.getId());
        req.setRecipientUserIds(List.of(app.getStudentId()));
        req.setChannels(List.of("in_app"));
        req.setTitle("勤工助学：已离岗");
        req.setContent(body.toString());
        req.setLevel("normal");
        safeSendNotification(req, "offboard_to_student", app.getId());
    }

    private void notifyOffboardToEmployer(WorkStudyApplication app, WorkStudyPosition pos) {
        if (pos.getOwnerUserId() == null) return;
        String title = pos.getTitle() != null ? pos.getTitle() : "勤工岗位";
        String studentName = app.getStudentName() != null ? app.getStudentName() : "学生";
        StringBuilder body = new StringBuilder(String.format("%s 已主动从「%s」岗位离岗。", studentName, title));
        if (app.getOffboardNote() != null && !app.getOffboardNote().isBlank()) {
            body.append("说明：").append(app.getOffboardNote());
        }
        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType("workstudy_application");
        req.setSourceId(app.getId());
        req.setRecipientUserIds(List.of(pos.getOwnerUserId()));
        req.setChannels(List.of("in_app"));
        req.setTitle("勤工助学：学生已离岗");
        req.setContent(body.toString());
        req.setLevel("normal");
        safeSendNotification(req, "offboard_to_employer", app.getId());
    }

    private void safeSendNotification(SendNotificationRequest req, String label, Long sourceId) {
        try {
            notificationService.send(req);
        } catch (Exception e) {
            log.warn("send {} notification failed source_id={}: {}", label, sourceId, e.getMessage());
        }
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
