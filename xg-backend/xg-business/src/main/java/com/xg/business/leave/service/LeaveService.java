package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.academic.mapper.AcademicTermMapper;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.common.exception.BizException;
import com.xg.business.leave.dto.LeaveApplyRequest;
import com.xg.business.leave.dto.LeaveProxyRequest;
import com.xg.business.leave.dto.LeaveQueryRequest;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.common.base.PageResult;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.form.FormDataValidator;
import com.xg.platform.workflow.form.FormField;
import com.xg.platform.workflow.form.FormSchema;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveService {

    private final LeaveConfigBaseService leaveConfigBaseService;
    private final LeaveCalendarService calendarService;
    private final LeaveRequestMapper leaveRequestMapper;
    private final AcademicTermMapper academicTermMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final com.xg.business.leave.mapper.StudentCollegeLookupMapper collegeLookupMapper;
    private final WorkflowEngine workflowEngine;
    private final ObjectMapper objectMapper;
    private final StudentEventPublisher studentEventPublisher;
    private final SysUserMapper sysUserMapper;
    private final FormDataValidator formDataValidator;
    private final LeaveTypeFieldTranslator leaveTypeFieldTranslator;
    private final LeaveGlobalConfigService leaveGlobalConfigService;

    private String resolveStudentName(Long studentId) {
        SysUser u = sysUserMapper.selectById(studentId);
        if (u == null || u.getRealName() == null || u.getRealName().isBlank()) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        return u.getRealName();
    }

    public List<LeaveTypeConfig> listLeaveTypes() {
        return leaveConfigBaseService.listEnabledLeaveTypes();
    }

    /**
     * Read the GUI-editor-shaped field list for a given leave type so the
     * 表单管理 editor can preload it. Translates from the legacy
     * {@code field_key/field_label/field_type} shape — the shape itself stays
     * unchanged for the editor UI even though the storage now lives in
     * {@code leave_config_base.config.leaveTypes[i].extraFields}.
     */
    public List<Map<String, Object>> getLeaveTypeFields(String code) {
        LeaveTypeConfig cfg = leaveConfigBaseService.findLeaveType(code);
        return leaveTypeFieldTranslator.fromExtraFieldsJson(cfg.getExtraFields());
    }

    /**
     * Replace the per-leave-type extra_fields with the supplied list of
     * GUI-editor payloads. Takes effect immediately — no draft/version (the
     * draft/publish lifecycle lands in §7.1 main work).
     */
    @Transactional
    public LeaveTypeConfig updateLeaveTypeFields(String code, List<Map<String, Object>> payloads, Long operatorId) {
        if (payloads == null) payloads = List.of();
        String arrayJson = leaveTypeFieldTranslator.toExtraFieldsJson(payloads);
        return leaveConfigBaseService.updateLeaveTypeExtraFields(code, arrayJson, operatorId);
    }

    @Transactional
    public LeaveRequest apply(LeaveApplyRequest req, Long studentId) {
        LeaveTypeConfig leaveType = findEnabledLeaveType(req.getLeaveTypeCode());

        BigDecimal durationDays = calculateDurationDays(req.getStartTime(), req.getEndTime(), leaveType.getCode());
        checkTimeOverlap(studentId, req.getStartTime(), req.getEndTime(), null);
        // V096 起学期累计上限改为全局软警告:不在 apply 路径里阻断,
        // 由学生申请页 / 辅导员审批页拉 GET /api/v1/leaves/term-usage 自行展示。

        FormSchema schema = buildLeaveFormSchema(leaveType);
        formDataValidator.validate(schema, req.getExtraData());

        LeaveRequest leave = new LeaveRequest();
        leave.setStudentId(studentId);
        leave.setStudentName(resolveStudentName(studentId));
        leave.setLeaveTypeCode(leaveType.getCode());
        leave.setLeaveTypeName(leaveType.getName());
        leave.setStartTime(req.getStartTime());
        leave.setEndTime(req.getEndTime());
        leave.setDurationDays(durationDays);
        leave.setReason(req.getReason());
        leave.setFormData(toJson(req.getExtraData()));
        leave.setAttachments(toJson(req.getAttachmentFileIds()));
        // Persist what AI prefilled (when the form was opened via chat agent)
        // so analytics can compare predictions vs final submitted values. The
        // diff signal feeds back into prompt tuning. Manual opens skip this.
        if (req.getAiDraft() != null && !req.getAiDraft().isEmpty()) {
            leave.setAiDraft(toJson(req.getAiDraft()));
        }
        leave.setStatus("pending");
        leave.setSubmittedBy(studentId);
        leave.setIsProxy(false);
        if (req.getApplyLatitude() != null && req.getApplyLongitude() != null) {
            leave.setApplyLatitude(req.getApplyLatitude());
            leave.setApplyLongitude(req.getApplyLongitude());
            leave.setApplyLocationAt(req.getApplyLocationAt() != null
                    ? req.getApplyLocationAt() : OffsetDateTime.now());
        }

        leaveRequestMapper.insert(leave);

        // Start workflow after transaction commits to avoid rollback-only issue
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                startWorkflowSafely(leave, studentId);
                studentEventPublisher.publish(studentId, StudentEventType.LEAVE_SUBMIT, "leave",
                        Map.of(
                                "leave_type", leaveType.getCode(),
                                "duration_days", durationDays,
                                "leave_request_id", leave.getId()
                        ));
            }
        });

        return leave;
    }

    @Transactional
    public LeaveRequest proxyApply(LeaveProxyRequest req, Long counselorId) {
        LeaveTypeConfig leaveType = findEnabledLeaveType(req.getLeaveTypeCode());

        BigDecimal durationDays = calculateDurationDays(req.getStartTime(), req.getEndTime(), leaveType.getCode());
        checkTimeOverlap(req.getStudentId(), req.getStartTime(), req.getEndTime(), null);
        // 学期累计上限同 apply:全局软警告,不在代办这条路上阻断。

        FormSchema schema = buildLeaveFormSchema(leaveType);
        formDataValidator.validate(schema, req.getExtraData());

        LeaveRequest leave = new LeaveRequest();
        leave.setStudentId(req.getStudentId());
        leave.setStudentName(resolveStudentName(req.getStudentId()));
        leave.setLeaveTypeCode(leaveType.getCode());
        leave.setLeaveTypeName(leaveType.getName());
        leave.setStartTime(req.getStartTime());
        leave.setEndTime(req.getEndTime());
        leave.setDurationDays(durationDays);
        leave.setReason(req.getReason());
        leave.setFormData(toJson(req.getExtraData()));
        leave.setAttachments(toJson(req.getAttachmentFileIds()));
        leave.setStatus("pending");
        leave.setSubmittedBy(counselorId);
        leave.setIsProxy(true);

        leaveRequestMapper.insert(leave);

        // Start workflow after transaction commits to avoid rollback-only issue
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                startWorkflowSafely(leave, req.getStudentId());
            }
        });

        return leave;
    }

    public PageResult<LeaveRequest> myLeaves(Long studentId, LeaveQueryRequest query) {
        Page<LeaveRequest> page = query.toPage();
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getStudentId, studentId)
                .eq(query.getStatus() != null, LeaveRequest::getStatus, query.getStatus())
                .eq(query.getLeaveTypeCode() != null, LeaveRequest::getLeaveTypeCode, query.getLeaveTypeCode())
                .ge(query.getStartDate() != null, LeaveRequest::getStartTime, query.getStartDate() != null ? query.getStartDate().atStartOfDay() : null)
                .le(query.getEndDate() != null, LeaveRequest::getEndTime, query.getEndDate() != null ? query.getEndDate().plusDays(1).atStartOfDay() : null)
                .orderByDesc(LeaveRequest::getCreatedAt);
        return PageResult.of(leaveRequestMapper.selectPage(page, wrapper));
    }

    public LeaveRequest getDetail(Long id) {
        LeaveRequest leave = leaveRequestMapper.selectById(id);
        if (leave == null) {
            throw LeaveErrorCode.LEAVE_NOT_FOUND.exception();
        }
        return leave;
    }

    @Transactional
    public void withdraw(Long id, Long studentId) {
        LeaveRequest leave = getDetail(id);
        if (!studentId.equals(leave.getStudentId())) {
            throw LeaveErrorCode.LEAVE_NOT_FOUND.exception();
        }
        if (!"pending".equals(leave.getStatus())) {
            throw LeaveErrorCode.LEAVE_CANNOT_WITHDRAW.exception();
        }
        leave.setStatus("cancelled");
        leaveRequestMapper.updateById(leave);
    }

    @Transactional
    public void cancelLeave(Long id, Long studentId) {
        LeaveRequest leave = getDetail(id);
        if (!studentId.equals(leave.getStudentId())) {
            throw LeaveErrorCode.LEAVE_NOT_FOUND.exception();
        }
        if (!"approved".equals(leave.getStatus())) {
            throw LeaveErrorCode.LEAVE_CANNOT_CANCEL.exception();
        }
        leave.setStatus("cancel_pending");
        leave.setCancelTime(OffsetDateTime.now());
        leaveRequestMapper.updateById(leave);
    }

    @Transactional
    public void confirmCancel(Long id, Long counselorId) {
        LeaveRequest leave = getDetail(id);
        if (!"cancel_pending".equals(leave.getStatus())) {
            throw LeaveErrorCode.LEAVE_CANNOT_CANCEL.exception();
        }
        leave.setStatus("cancelled");
        leave.setCancelledBy(counselorId);
        leave.setCancelTime(OffsetDateTime.now());
        leaveRequestMapper.updateById(leave);

        studentEventPublisher.publish(leave.getStudentId(), StudentEventType.LEAVE_CANCELLED, "leave", Map.of(
                "leave_id", leave.getId(),
                "source", "confirm",
                "cancelled_by", counselorId
        ));
    }

    @Transactional
    public void forceCancel(Long id, Long counselorId) {
        LeaveRequest leave = getDetail(id);
        if (!List.of("approved", "cancel_pending").contains(leave.getStatus())) {
            throw new BizException("INVALID_STATUS", "当前状态不允许强制销假");
        }
        leave.setStatus("cancelled");
        leave.setCancelledBy(counselorId);
        leave.setCancelTime(OffsetDateTime.now());
        leaveRequestMapper.updateById(leave);

        studentEventPublisher.publish(leave.getStudentId(), StudentEventType.LEAVE_CANCELLED, "leave", Map.of(
                "leave_id", leave.getId(),
                "source", "force",
                "cancelled_by", counselorId
        ));
    }

    public PageResult<LeaveRequest> classLeaves(Long approverId, LeaveQueryRequest query) {
        // Caller may be a counselor (sees their class students), a dean (sees
        // all students in their college), a class master (sees their class via
        // org_unit.leader_id), or any combination — union all so role assignments
        // combine cleanly without service-layer role-sniffing.
        Set<Long> studentIdSet = new HashSet<>();
        studentIdSet.addAll(studentProfileMapper.findStudentUserIdsByCounselor(approverId));
        studentIdSet.addAll(studentProfileMapper.findStudentUserIdsByDean(approverId));
        studentIdSet.addAll(studentProfileMapper.findStudentUserIdsByClassMaster(approverId));
        List<Long> studentIds = List.copyOf(studentIdSet);
        Page<LeaveRequest> page = query.toPage();
        if (studentIds.isEmpty()) {
            Page<LeaveRequest> empty = new Page<>(page.getCurrent(), page.getSize(), 0);
            empty.setRecords(List.of());
            return PageResult.of(empty);
        }
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<LeaveRequest>()
                .in(LeaveRequest::getStudentId, studentIds)
                .eq(query.getStatus() != null, LeaveRequest::getStatus, query.getStatus())
                .eq(query.getLeaveTypeCode() != null, LeaveRequest::getLeaveTypeCode, query.getLeaveTypeCode())
                .ge(query.getStartDate() != null, LeaveRequest::getStartTime, query.getStartDate() != null ? query.getStartDate().atStartOfDay() : null)
                .le(query.getEndDate() != null, LeaveRequest::getEndTime, query.getEndDate() != null ? query.getEndDate().plusDays(1).atStartOfDay() : null)
                .orderByDesc(LeaveRequest::getCreatedAt);
        return PageResult.of(leaveRequestMapper.selectPage(page, wrapper));
    }

    public PageResult<LeaveRequest> uncancelledLeaves(LeaveQueryRequest query) {
        Page<LeaveRequest> page = query.toPage();
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getStatus, "approved")
                .isNull(LeaveRequest::getCancelTime)
                .lt(LeaveRequest::getEndTime, OffsetDateTime.now())
                .orderByDesc(LeaveRequest::getCreatedAt);
        return PageResult.of(leaveRequestMapper.selectPage(page, wrapper));
    }

    /** 学生申请人工销假但辅导员还没审的列表 — 销假改造后的"人工兜底"待办池。 */
    public PageResult<LeaveRequest> pendingManualReturns(LeaveQueryRequest query) {
        Page<LeaveRequest> page = query.toPage();
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getStatus, "pending_manual_return")
                .orderByDesc(LeaveRequest::getManualReturnSubmittedAt);
        return PageResult.of(leaveRequestMapper.selectPage(page, wrapper));
    }

    public Map<String, Object> leaveStats(LeaveQueryRequest query) {
        LambdaQueryWrapper<LeaveRequest> baseWrapper = new LambdaQueryWrapper<LeaveRequest>()
                .ge(query.getStartDate() != null, LeaveRequest::getStartTime, query.getStartDate() != null ? query.getStartDate().atStartOfDay() : null)
                .le(query.getEndDate() != null, LeaveRequest::getEndTime, query.getEndDate() != null ? query.getEndDate().plusDays(1).atStartOfDay() : null);

        long total = leaveRequestMapper.selectCount(baseWrapper);

        Map<String, Long> byStatus = new HashMap<>();
        for (String status : List.of("draft", "pending", "approved", "rejected", "cancelled", "cancel_pending")) {
            long count = leaveRequestMapper.selectCount(
                    new LambdaQueryWrapper<LeaveRequest>()
                            .eq(LeaveRequest::getStatus, status)
                            .ge(query.getStartDate() != null, LeaveRequest::getStartTime, query.getStartDate() != null ? query.getStartDate().atStartOfDay() : null)
                            .le(query.getEndDate() != null, LeaveRequest::getEndTime, query.getEndDate() != null ? query.getEndDate().plusDays(1).atStartOfDay() : null)
            );
            if (count > 0) {
                byStatus.put(status, count);
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", total);
        stats.put("byStatus", byStatus);
        return stats;
    }

    // --- Private helpers ---

    private LeaveTypeConfig findEnabledLeaveType(String code) {
        try {
            return leaveConfigBaseService.findEnabledLeaveType(code);
        } catch (BizException e) {
            // Translate generic NOT_FOUND / LEAVE_TYPE_DISABLED into the
            // module-specific LeaveErrorCode that callers/Tests already match.
            if ("NOT_FOUND".equals(e.getCode())) {
                throw LeaveErrorCode.LEAVE_TYPE_NOT_FOUND.exception();
            }
            if ("LEAVE_TYPE_DISABLED".equals(e.getCode())) {
                throw LeaveErrorCode.LEAVE_TYPE_DISABLED.exception();
            }
            throw e;
        }
    }

    /** 单次请假时长上限(天)。新口径(工作时段 8h=1天)下,30 仍是合理上限。 */
    private static final BigDecimal MAX_DURATION_DAYS = BigDecimal.valueOf(30);

    /**
     * 请假天数 = 工作时段(09:00–12:00 + 13:00–18:00)累计秒数 / 28800,
     * 跳过周末 + holiday_calendar.public_holiday,认 compensatory_workday。
     * 详细规则见 {@link LeaveCalendarService#calcEffectiveDays}。
     */
    private BigDecimal calculateDurationDays(OffsetDateTime start, OffsetDateTime end, String leaveTypeCode) {
        BigDecimal result = calendarService.calcEffectiveDays(start, end, true);
        if (result.compareTo(MAX_DURATION_DAYS) > 0) {
            throw LeaveErrorCode.LEAVE_DURATION_EXCEEDED.exception();
        }
        return result;
    }

    private void checkTimeOverlap(Long studentId, OffsetDateTime start, OffsetDateTime end, Long excludeId) {
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getStudentId, studentId)
                .in(LeaveRequest::getStatus, List.of("pending", "approved"))
                .lt(LeaveRequest::getStartTime, end)
                .gt(LeaveRequest::getEndTime, start)
                .ne(excludeId != null, LeaveRequest::getId, excludeId);
        long count = leaveRequestMapper.selectCount(wrapper);
        if (count > 0) {
            throw LeaveErrorCode.LEAVE_TIME_OVERLAP.exception();
        }
    }

    /**
     * 计算指定学生本学期"全部假别"累计请假天数,以及是否超过全局上限。
     * 规则:
     *   1) 没有 is_current=true 的学期 → termName=null,accumulated=0,exceeded=false
     *   2) 累计口径:status ∈ {pending, approved} 且 start_time 落在当前学期内
     *   3) capDays = leave_global_config.term_max_days(NULL = 不限,不会判 exceeded)
     */
    public com.xg.business.leave.dto.LeaveTermUsageView getTermUsage(Long studentId) {
        com.xg.business.leave.dto.LeaveTermUsageView view = new com.xg.business.leave.dto.LeaveTermUsageView();
        BigDecimal cap = leaveGlobalConfigService.getTermMaxDays();
        view.setCapDays(cap);
        view.setAccumulatedDays(BigDecimal.ZERO);
        view.setExceeded(false);

        AcademicTerm term = academicTermMapper.selectOne(
                new LambdaQueryWrapper<AcademicTerm>()
                        .eq(AcademicTerm::getIsCurrent, true)
                        .last("LIMIT 1"));
        if (term == null || term.getStartDate() == null || term.getEndDate() == null) {
            return view;
        }
        view.setTermName(term.getName());

        java.time.ZoneOffset offset = OffsetDateTime.now().getOffset();
        OffsetDateTime termStart = term.getStartDate().atStartOfDay().atOffset(offset);
        OffsetDateTime termEndExclusive = term.getEndDate().plusDays(1).atStartOfDay().atOffset(offset);

        BigDecimal accumulated = leaveRequestMapper.selectList(
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStudentId, studentId)
                        .in(LeaveRequest::getStatus, List.of("pending", "approved"))
                        .ge(LeaveRequest::getStartTime, termStart)
                        .lt(LeaveRequest::getStartTime, termEndExclusive))
                .stream()
                .map(LeaveRequest::getDurationDays)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        view.setAccumulatedDays(accumulated);
        view.setExceeded(cap != null && accumulated.compareTo(cap) > 0);
        return view;
    }

    /**
     * Combine the workflow's public form schema (leave_v3.form.fields) with
     * the selected leave-type's extra fields so the validator can accept
     * keys from both. Without this, type-specific fields like
     * {@code reason_category}/{@code evidence} would be rejected as
     * "未知字段".
     */
    private FormSchema buildLeaveFormSchema(LeaveTypeConfig leaveType) {
        FormSchema base = workflowEngine.loadFormSchemaByBizType("leave");
        FormSchema combined = new FormSchema();
        if (base != null && base.getFields() != null) {
            combined.getFields().addAll(base.getFields());
        }
        List<FormField> typeFields = leaveTypeFieldTranslator.toFormFields(leaveType.getExtraFields());
        combined.getFields().addAll(typeFields);
        return combined;
    }

    private void startWorkflowSafely(LeaveRequest leave, Long applicantId) {
        try {
            Map<String, Object> formData = new HashMap<>();
            formData.put("leave_type_code", leave.getLeaveTypeCode());
            formData.put("duration_days", leave.getDurationDays());
            formData.put("student_id", leave.getStudentId());
            formData.put("leave_request_id", leave.getId());

            // A.1：按学生 college_id 路由到对应 leave_v3 YAML（NULL=全校默认）。
            // 替换原 startWorkflowDynamicOrFallback —— 不再读 leave_request.config_snapshot
            // 编译 chain，统一走 workflow_definition.config_yaml 主路径（v9）。
            Long collegeId = collegeLookupMapper.findCollegeIdOfStudent(leave.getStudentId());
            WorkflowInstance instance = workflowEngine.startWorkflowByBizType(
                    "leave", collegeId, applicantId, leave.getId(), formData, null);
            leave.setWorkflowInstanceId(instance.getId());
            leaveRequestMapper.updateById(leave);
        } catch (Exception e) {
            log.warn("Failed to start workflow for leave {}: {}", leave.getId(), e.getMessage());
        }
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize value to JSON: {}", e.getMessage());
            return null;
        }
    }
}
