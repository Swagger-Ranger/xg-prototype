package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.exception.BizException;
import com.xg.business.leave.dto.LeaveApplyRequest;
import com.xg.business.leave.dto.LeaveProxyRequest;
import com.xg.business.leave.dto.LeaveQueryRequest;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.mapper.LeaveTypeConfigMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.common.base.PageResult;
import com.xg.platform.workflow.engine.WorkflowEngine;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveService {

    private final LeaveTypeConfigMapper leaveTypeConfigMapper;
    private final LeaveRequestMapper leaveRequestMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final WorkflowEngine workflowEngine;
    private final ObjectMapper objectMapper;

    public List<LeaveTypeConfig> listLeaveTypes() {
        return leaveTypeConfigMapper.selectList(
                new LambdaQueryWrapper<LeaveTypeConfig>()
                        .eq(LeaveTypeConfig::getEnabled, true)
                        .orderByAsc(LeaveTypeConfig::getSortOrder)
        );
    }

    @Transactional
    public LeaveRequest apply(LeaveApplyRequest req, Long studentId, String studentName) {
        LeaveTypeConfig leaveType = findEnabledLeaveType(req.getLeaveTypeCode());

        BigDecimal durationDays = calculateDurationDays(req.getStartTime(), req.getEndTime());
        checkTimeOverlap(studentId, req.getStartTime(), req.getEndTime(), null);

        LeaveRequest leave = new LeaveRequest();
        leave.setStudentId(studentId);
        leave.setStudentName(studentName);
        leave.setLeaveTypeCode(leaveType.getCode());
        leave.setLeaveTypeName(leaveType.getName());
        leave.setStartTime(req.getStartTime());
        leave.setEndTime(req.getEndTime());
        leave.setDurationDays(durationDays);
        leave.setReason(req.getReason());
        leave.setFormData(toJson(req.getExtraData()));
        leave.setAttachments(toJson(req.getAttachmentFileIds()));
        leave.setStatus("pending");
        leave.setSubmittedBy(studentId);
        leave.setIsProxy(false);

        leaveRequestMapper.insert(leave);

        // Start workflow after transaction commits to avoid rollback-only issue
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                startWorkflowSafely(leave, studentId);
            }
        });

        return leave;
    }

    @Transactional
    public LeaveRequest proxyApply(LeaveProxyRequest req, Long counselorId) {
        LeaveTypeConfig leaveType = findEnabledLeaveType(req.getLeaveTypeCode());

        BigDecimal durationDays = calculateDurationDays(req.getStartTime(), req.getEndTime());
        checkTimeOverlap(req.getStudentId(), req.getStartTime(), req.getEndTime(), null);

        LeaveRequest leave = new LeaveRequest();
        leave.setStudentId(req.getStudentId());
        leave.setStudentName("Unknown");
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
    }

    public PageResult<LeaveRequest> classLeaves(Long counselorId, LeaveQueryRequest query) {
        List<Long> studentIds = studentProfileMapper.findStudentUserIdsByCounselor(counselorId);
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
        LeaveTypeConfig leaveType = leaveTypeConfigMapper.selectOne(
                new LambdaQueryWrapper<LeaveTypeConfig>()
                        .eq(LeaveTypeConfig::getCode, code)
        );
        if (leaveType == null) {
            throw LeaveErrorCode.LEAVE_TYPE_NOT_FOUND.exception();
        }
        if (!Boolean.TRUE.equals(leaveType.getEnabled())) {
            throw LeaveErrorCode.LEAVE_TYPE_DISABLED.exception();
        }
        return leaveType;
    }

    private BigDecimal calculateDurationDays(OffsetDateTime start, OffsetDateTime end) {
        long seconds = java.time.Duration.between(start, end).getSeconds();
        double days = Math.ceil(seconds / 86400.0);
        return BigDecimal.valueOf(days).setScale(1, RoundingMode.HALF_UP);
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

    private void startWorkflowSafely(LeaveRequest leave, Long applicantId) {
        try {
            Map<String, Object> formData = new HashMap<>();
            formData.put("leave_type_code", leave.getLeaveTypeCode());
            formData.put("duration_days", leave.getDurationDays());
            formData.put("student_id", leave.getStudentId());
            formData.put("leave_request_id", leave.getId());

            WorkflowInstance instance = workflowEngine.startWorkflow(
                    "leave_v2",
                    applicantId,
                    "leave",
                    leave.getId(),
                    formData,
                    null
            );
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
