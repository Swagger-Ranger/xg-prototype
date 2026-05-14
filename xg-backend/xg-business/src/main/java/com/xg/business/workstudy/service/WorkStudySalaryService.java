package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.workstudy.dto.SalaryDecisionRequest;
import com.xg.business.workstudy.dto.SalaryQueryRequest;
import com.xg.business.workstudy.dto.SalarySubmitRequest;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 用工单位申报 + 资助中心审批的薪资工作流（biz_type=workstudy_salary, def 1007）。
 *
 * <p>区别于 {@link WorkStudySalarySettlementService}：那是按 timesheet 自动批量结算的
 * 历史路径，结果落 status=pending 的 salary 行；本服务是用户驱动的"申报-审批"路径，
 * 落 status=draft → 工作流启动 → 监听器 flips 到 confirmed/rejected。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudySalaryService {

    /** 视为"全局视野"的管理员角色集（school_admin + aliases）。employer 角色仅看本单位。 */
    private static final java.util.Set<String> ADMIN_LIKE_ROLES = java.util.Set.of(
            "school_admin", "student_affairs_officer", "student_affairs_director",
            "aid_center_officer", "super_admin");

    private final WorkStudySalaryMapper salaryMapper;
    private final WorkStudyApplicationMapper applicationMapper;
    private final WorkStudyPositionMapper positionMapper;
    private final WorkflowEngine workflowEngine;
    private final TaskInstanceMapper taskInstanceMapper;
    private final NotificationOrchestrator notificationOrchestrator;
    private final EmployerService employerService;

    /**
     * 用工单位申报某学生在某月的薪资。月内可多次申报（不同 month 多条；同月再次申报视作新行）。
     */
    @Transactional
    public WorkStudySalary submit(SalarySubmitRequest req, Long reporterId) {
        WorkStudyApplication app = applicationMapper.selectById(req.getApplicationId());
        if (app == null) throw WorkStudyErrorCode.APPLICATION_NOT_FOUND.exception();
        if (!"hired".equals(app.getStatus())) {
            throw WorkStudyErrorCode.APPLICATION_NOT_HIRED_FOR_SALARY.exception();
        }
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null) throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();

        // Resolve unit + rate. Prefer V051 fields; fall back to legacy hourly_rate.
        String unitType = pos.getSalaryUnit() != null ? pos.getSalaryUnit() : "hour";
        BigDecimal unitRate = pos.getSalaryAmount() != null ? pos.getSalaryAmount() : pos.getHourlyRate();
        if (unitRate == null) {
            throw WorkStudyErrorCode.SALARY_INVALID_POSITION_RATE.exception();
        }
        BigDecimal amount = unitRate.multiply(req.getUnits()).setScale(2, RoundingMode.HALF_UP);

        WorkStudySalary s = new WorkStudySalary();
        s.setStudentId(app.getStudentId());
        s.setPositionId(app.getPositionId());
        s.setPositionType(pos.getPositionType());
        s.setMonth(req.getMonth());
        s.setUnits(req.getUnits());
        s.setUnitType(unitType);
        s.setUnitRate(unitRate);
        s.setAmount(amount);
        // legacy snapshot (some downstream readers still look at hours/hourly_rate)
        if ("hour".equals(unitType)) {
            s.setHours(req.getUnits());
            s.setHourlyRate(unitRate);
        }
        s.setReporterId(reporterId);
        s.setReportNote(req.getReportNote());
        s.setStatus("draft");
        salaryMapper.insert(s);

        Map<String, Object> formData = new HashMap<>();
        formData.put("salary_id", s.getId());
        formData.put("application_id", app.getId());
        formData.put("student_id", app.getStudentId());
        formData.put("position_id", app.getPositionId());
        formData.put("month", req.getMonth());
        formData.put("amount", amount);
        formData.put("unit_type", unitType);
        formData.put("units", req.getUnits());

        try {
            WorkflowInstance instance = workflowEngine.startWorkflowByBizType(
                    "workstudy_salary", reporterId, s.getId(), formData, null);
            s.setWorkflowInstanceId(instance.getId());
            s.setStatus("pending");
            salaryMapper.updateById(s);
        } catch (Exception e) {
            log.warn("Failed to start salary workflow for salary {}: {}", s.getId(), e.getMessage());
        }

        // 申报通知 — 让学生知道用人单位已提交他这个月的薪资，正在等资助中心审。
        // 走 Orchestrator + WORKSTUDY_SALARY_SUBMITTED 模板,管理员可改文案 / 渠道 / 静默。
        if (app.getStudentId() != null) {
            try {
                Map<String, Object> vars = new HashMap<>();
                vars.put("month", req.getMonth());
                vars.put("position_title", pos.getTitle() != null ? pos.getTitle() : "勤工岗位");
                vars.put("amount", amount.toPlainString());
                notificationOrchestrator.send(
                        "WORKSTUDY_SALARY_SUBMITTED", "workstudy_salary", s.getId(),
                        RecipientContext.applicant(app.getStudentId()), vars);
            } catch (Exception e) {
                log.warn("Failed to notify student of salary submission for salary {}: {}", s.getId(), e.getMessage());
            }
        }
        return s;
    }

    /**
     * 资助中心 approve / reject。最终 salary.status 由 {@code WorkStudyWorkflowListener}
     * 在工作流终态时同步。
     */
    @Transactional
    public void decide(Long salaryId, SalaryDecisionRequest req, Long reviewerId) {
        WorkStudySalary salary = salaryMapper.selectById(salaryId);
        if (salary == null) throw WorkStudyErrorCode.SALARY_NOT_FOUND.exception();
        if (!"pending".equals(salary.getStatus())) {
            throw WorkStudyErrorCode.SALARY_NOT_PENDING.exception();
        }
        // Manual employer-driven salaries (V056) carry workflow_instance_id and
        // are advanced via 1007. Auto-settled salaries (timesheet-derived) have
        // no workflow_instance_id and we set the terminal status directly.
        if (salary.getWorkflowInstanceId() != null) {
            TaskInstance task = findPendingTask(salary.getWorkflowInstanceId());
            workflowEngine.handleApproval(task.getId(), req.getAction(), req.getNote(), reviewerId);
            if ("approve".equals(req.getAction())) {
                // The WorkStudyWorkflowListener flips status='confirmed' synchronously
                // when handleApproval fires the END node. Reload before stamping
                // confirmedBy so we don't overwrite that with the stale snapshot.
                WorkStudySalary fresh = salaryMapper.selectById(salaryId);
                if (fresh != null) {
                    fresh.setConfirmedBy(reviewerId);
                    salaryMapper.updateById(fresh);
                }
            }
        } else {
            salary.setStatus("approve".equals(req.getAction()) ? "confirmed" : "rejected");
            salary.setConfirmedBy(reviewerId);
            salary.setConfirmedAt(java.time.OffsetDateTime.now());
            salaryMapper.updateById(salary);
        }
    }

    public WorkStudySalary detail(Long id) {
        WorkStudySalary s = salaryMapper.selectById(id);
        if (s == null) throw WorkStudyErrorCode.SALARY_NOT_FOUND.exception();
        return s;
    }

    /**
     * P2-8：employer 角色（非 admin）只能看本单位岗位下的薪资。
     * student 在 controller 已被强制 studentId，不在此处再判。
     */
    public PageResult<WorkStudySalary> list(SalaryQueryRequest q, Long currentUserId, java.util.List<String> currentUserRoles) {
        Page<WorkStudySalary> page = q.toPage();
        LambdaQueryWrapper<WorkStudySalary> wrapper = new LambdaQueryWrapper<WorkStudySalary>()
                .eq(q.getStudentId() != null, WorkStudySalary::getStudentId, q.getStudentId())
                .eq(q.getPositionId() != null, WorkStudySalary::getPositionId, q.getPositionId())
                .eq(q.getMonth() != null, WorkStudySalary::getMonth, q.getMonth())
                .eq(q.getStatus() != null, WorkStudySalary::getStatus, q.getStatus())
                .eq(q.getPositionType() != null, WorkStudySalary::getPositionType, q.getPositionType());

        boolean isAdmin = currentUserRoles != null
                && currentUserRoles.stream().anyMatch(ADMIN_LIKE_ROLES::contains);
        boolean isEmployerOnly = !isAdmin && currentUserRoles != null && currentUserRoles.contains("employer");
        if (isEmployerOnly) {
            java.util.Set<Long> myEmployerIds = employerService.listMine(currentUserId).stream()
                    .map(com.xg.business.workstudy.model.Employer::getId)
                    .collect(java.util.stream.Collectors.toSet());
            if (myEmployerIds.isEmpty()) {
                return PageResult.of(page);
            }
            java.util.List<WorkStudyPosition> myPositions = positionMapper.selectList(
                    new LambdaQueryWrapper<WorkStudyPosition>()
                            .in(WorkStudyPosition::getEmployerId, myEmployerIds)
                            .select(WorkStudyPosition::getId));
            if (myPositions.isEmpty()) {
                return PageResult.of(page);
            }
            wrapper.in(WorkStudySalary::getPositionId,
                    myPositions.stream().map(WorkStudyPosition::getId).toList());
        }

        wrapper.orderByDesc(WorkStudySalary::getCreatedAt);
        Page<WorkStudySalary> pageResult = salaryMapper.selectPage(page, wrapper);

        if (q.getInclude() != null && q.getInclude().contains("position")) {
            attachPositionSummaries(pageResult.getRecords());
        }
        return PageResult.of(pageResult);
    }

    private void attachPositionSummaries(List<WorkStudySalary> rows) {
        if (rows == null || rows.isEmpty()) return;
        java.util.Set<Long> ids = new java.util.HashSet<>();
        for (WorkStudySalary s : rows) if (s.getPositionId() != null) ids.add(s.getPositionId());
        if (ids.isEmpty()) return;
        List<WorkStudyPosition> positions = positionMapper.selectBatchIds(ids);
        java.util.Map<Long, com.xg.business.workstudy.model.WorkStudyApplication.PositionSummary> byId = new java.util.HashMap<>();
        for (WorkStudyPosition p : positions) {
            byId.put(p.getId(), com.xg.business.workstudy.model.WorkStudyApplication.PositionSummary.fromPosition(p));
        }
        for (WorkStudySalary s : rows) {
            s.setPositionSummary(byId.get(s.getPositionId()));
        }
    }

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
