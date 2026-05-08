package com.xg.business.violation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.violation.dto.PunishmentCreateRequest;
import com.xg.business.violation.dto.PunishmentQueryRequest;
import com.xg.business.violation.dto.ViolationAppealCreateRequest;
import com.xg.business.violation.dto.ViolationAppealQueryRequest;
import com.xg.business.violation.dto.ViolationAppealResolveRequest;
import com.xg.business.violation.dto.ViolationCreateRequest;
import com.xg.business.violation.dto.ViolationQueryRequest;
import com.xg.business.violation.dto.ViolationRejectRequest;
import com.xg.business.violation.mapper.PunishmentMapper;
import com.xg.business.violation.mapper.ViolationAppealMapper;
import com.xg.business.violation.mapper.ViolationRecordMapper;
import com.xg.business.violation.model.Punishment;
import com.xg.business.violation.model.ViolationAppeal;
import com.xg.business.violation.model.ViolationRecord;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ViolationService {

    private final ViolationRecordMapper violationRecordMapper;
    private final PunishmentMapper punishmentMapper;
    private final ViolationAppealMapper violationAppealMapper;
    private final StudentEventPublisher studentEventPublisher;
    private final SysUserMapper sysUserMapper;

    private String resolveName(Long userId, String errorCode, String errorMsg) {
        SysUser u = sysUserMapper.selectById(userId);
        if (u == null || u.getRealName() == null || u.getRealName().isBlank()) {
            throw new BizException(errorCode, errorMsg);
        }
        return u.getRealName();
    }

    @Transactional
    public ViolationRecord recordViolation(ViolationCreateRequest req, Long recorderId) {
        ViolationRecord record = new ViolationRecord();
        record.setStudentId(req.getStudentId());
        record.setStudentName(resolveName(req.getStudentId(), "STUDENT_NOT_FOUND", "学生信息不存在"));
        record.setCategory(req.getCategory());
        record.setOccurredAt(req.getOccurredAt());
        record.setLocation(req.getLocation());
        record.setDescription(req.getDescription());
        record.setRecorderId(recorderId);
        record.setRecorderName(resolveName(recorderId, "RECORDER_NOT_FOUND", "记录人信息不存在"));
        record.setApprovalStatus("draft");
        violationRecordMapper.insert(record);
        return record;
    }

    @Transactional
    public ViolationRecord submitForApproval(Long id, Long recorderId) {
        ViolationRecord record = requireRecord(id);
        if (!"draft".equals(record.getApprovalStatus()) && !"rejected".equals(record.getApprovalStatus())) {
            throw ViolationErrorCode.VIOLATION_INVALID_STATUS.exception();
        }
        record.setApprovalStatus("pending");
        record.setSubmittedAt(OffsetDateTime.now());
        record.setRejectionReason(null);
        violationRecordMapper.updateById(record);
        return record;
    }

    @Transactional
    public ViolationRecord approve(Long id, Long approverId) {
        ViolationRecord record = requireRecord(id);
        if (!"pending".equals(record.getApprovalStatus())) {
            throw ViolationErrorCode.VIOLATION_INVALID_STATUS.exception();
        }
        record.setApprovalStatus("approved");
        record.setApproverId(approverId);
        record.setApproverName(resolveName(approverId, "APPROVER_NOT_FOUND", "审批人信息不存在"));
        record.setApprovedAt(OffsetDateTime.now());
        violationRecordMapper.updateById(record);
        studentEventPublisher.publish(record.getStudentId(), StudentEventType.VIOLATION_APPROVED, "violation",
                Map.of(
                        "violation_type", record.getCategory() == null ? "" : record.getCategory(),
                        "violation_id", record.getId()
                ));
        studentEventPublisher.publish(record.getStudentId(), StudentEventType.VIOLATION_RECORDED, "violation",
                Map.of(
                        "violation_type", record.getCategory() == null ? "" : record.getCategory(),
                        "violation_id", record.getId()
                ));
        return record;
    }

    @Transactional
    public ViolationRecord reject(Long id, ViolationRejectRequest req, Long approverId) {
        ViolationRecord record = requireRecord(id);
        if (!"pending".equals(record.getApprovalStatus())) {
            throw ViolationErrorCode.VIOLATION_INVALID_STATUS.exception();
        }
        record.setApprovalStatus("rejected");
        record.setApproverId(approverId);
        record.setApproverName(resolveName(approverId, "APPROVER_NOT_FOUND", "审批人信息不存在"));
        record.setApprovedAt(OffsetDateTime.now());
        record.setRejectionReason(req.getReason());
        violationRecordMapper.updateById(record);
        return record;
    }

    public PageResult<ViolationRecord> listViolations(ViolationQueryRequest query) {
        Page<ViolationRecord> page = query.toPage();
        LambdaQueryWrapper<ViolationRecord> wrapper = new LambdaQueryWrapper<ViolationRecord>()
                .eq(query.getStudentId() != null, ViolationRecord::getStudentId, query.getStudentId())
                .eq(query.getCategory() != null, ViolationRecord::getCategory, query.getCategory())
                .eq(query.getApprovalStatus() != null, ViolationRecord::getApprovalStatus, query.getApprovalStatus())
                .eq(query.getRecorderId() != null, ViolationRecord::getRecorderId, query.getRecorderId())
                .ge(query.getStartDate() != null, ViolationRecord::getOccurredAt, query.getStartDate() == null ? null : query.getStartDate().atStartOfDay())
                .le(query.getEndDate() != null, ViolationRecord::getOccurredAt, query.getEndDate() == null ? null : query.getEndDate().plusDays(1).atStartOfDay())
                .orderByDesc(ViolationRecord::getOccurredAt);
        return PageResult.of(violationRecordMapper.selectPage(page, wrapper));
    }

    public ViolationRecord violationDetail(Long id) {
        return requireRecord(id);
    }

    private ViolationRecord requireRecord(Long id) {
        ViolationRecord record = violationRecordMapper.selectById(id);
        if (record == null) {
            throw ViolationErrorCode.VIOLATION_NOT_FOUND.exception();
        }
        return record;
    }

    @Transactional
    public Punishment issuePunishment(PunishmentCreateRequest req, Long issuerId) {
        Punishment p = new Punishment();
        p.setViolationRecordId(req.getViolationRecordId());
        p.setStudentId(req.getStudentId());
        p.setStudentName(resolveName(req.getStudentId(), "STUDENT_NOT_FOUND", "学生信息不存在"));
        p.setLevel(req.getLevel());
        p.setReason(req.getReason());
        p.setEffectiveDate(req.getEffectiveDate());
        p.setExpiryDate(req.getExpiryDate());
        p.setStatus("effective");
        p.setIssuerId(issuerId);
        p.setIssuerName(resolveName(issuerId, "ISSUER_NOT_FOUND", "签发人信息不存在"));
        punishmentMapper.insert(p);
        if (req.getViolationRecordId() != null) {
            ViolationRecord linked = violationRecordMapper.selectById(req.getViolationRecordId());
            if (linked != null) {
                linked.setPunishmentId(p.getId());
                violationRecordMapper.updateById(linked);
            }
        }
        return p;
    }

    public PageResult<Punishment> listPunishments(PunishmentQueryRequest query) {
        Page<Punishment> page = query.toPage();
        LambdaQueryWrapper<Punishment> wrapper = new LambdaQueryWrapper<Punishment>()
                .eq(query.getStudentId() != null, Punishment::getStudentId, query.getStudentId())
                .eq(query.getLevel() != null, Punishment::getLevel, query.getLevel())
                .eq(query.getStatus() != null, Punishment::getStatus, query.getStatus())
                .orderByDesc(Punishment::getEffectiveDate);
        return PageResult.of(punishmentMapper.selectPage(page, wrapper));
    }

    public Punishment punishmentDetail(Long id) {
        Punishment p = punishmentMapper.selectById(id);
        if (p == null) {
            throw ViolationErrorCode.PUNISHMENT_NOT_FOUND.exception();
        }
        return p;
    }

    @Transactional
    public ViolationAppeal submitAppeal(ViolationAppealCreateRequest req, Long studentId) {
        ViolationRecord record = requireRecord(req.getViolationRecordId());
        if (!record.getStudentId().equals(studentId)) {
            throw ViolationErrorCode.APPEAL_NOT_OWNED.exception();
        }
        if (!"approved".equals(record.getApprovalStatus())) {
            throw ViolationErrorCode.VIOLATION_NOT_APPROVED.exception();
        }
        Long existing = violationAppealMapper.selectCount(
                new LambdaQueryWrapper<ViolationAppeal>()
                        .eq(ViolationAppeal::getViolationRecordId, record.getId())
                        .in(ViolationAppeal::getStatus, "pending", "upheld"));
        if (existing != null && existing > 0) {
            throw ViolationErrorCode.APPEAL_ALREADY_EXISTS.exception();
        }
        ViolationAppeal appeal = new ViolationAppeal();
        appeal.setViolationRecordId(record.getId());
        appeal.setStudentId(studentId);
        appeal.setStudentName(resolveName(studentId, "STUDENT_NOT_FOUND", "学生信息不存在"));
        appeal.setReason(req.getReason());
        appeal.setStatus("pending");
        violationAppealMapper.insert(appeal);
        studentEventPublisher.publish(studentId, StudentEventType.VIOLATION_APPEAL_SUBMITTED, "violation_appeal",
                Map.of(
                        "appeal_id", appeal.getId(),
                        "violation_id", record.getId()
                ));
        return appeal;
    }

    @Transactional
    public ViolationAppeal resolveAppeal(Long id, ViolationAppealResolveRequest req, Long resolverId) {
        ViolationAppeal appeal = violationAppealMapper.selectById(id);
        if (appeal == null) {
            throw ViolationErrorCode.APPEAL_NOT_FOUND.exception();
        }
        if (!"pending".equals(appeal.getStatus())) {
            throw ViolationErrorCode.APPEAL_INVALID_STATUS.exception();
        }
        appeal.setStatus(req.getOutcome());
        appeal.setResolverId(resolverId);
        appeal.setResolverName(resolveName(resolverId, "RESOLVER_NOT_FOUND", "处理人信息不存在"));
        appeal.setResolutionNote(req.getNote());
        appeal.setResolvedAt(OffsetDateTime.now());
        violationAppealMapper.updateById(appeal);

        if ("upheld".equals(req.getOutcome())) {
            ViolationRecord record = violationRecordMapper.selectById(appeal.getViolationRecordId());
            if (record != null) {
                record.setApprovalStatus("revoked");
                violationRecordMapper.updateById(record);
                if (record.getPunishmentId() != null) {
                    Punishment p = punishmentMapper.selectById(record.getPunishmentId());
                    if (p != null && !"revoked".equals(p.getStatus())) {
                        p.setStatus("revoked");
                        punishmentMapper.updateById(p);
                    }
                }
                studentEventPublisher.publish(record.getStudentId(), StudentEventType.VIOLATION_APPEAL_UPHELD, "violation_appeal",
                        Map.of(
                                "appeal_id", appeal.getId(),
                                "violation_id", record.getId()
                        ));
            }
        } else {
            studentEventPublisher.publish(appeal.getStudentId(), StudentEventType.VIOLATION_APPEAL_REJECTED, "violation_appeal",
                    Map.of(
                            "appeal_id", appeal.getId(),
                            "violation_id", appeal.getViolationRecordId()
                    ));
        }
        return appeal;
    }

    public PageResult<ViolationAppeal> listAppeals(ViolationAppealQueryRequest query) {
        Page<ViolationAppeal> page = query.toPage();
        LambdaQueryWrapper<ViolationAppeal> wrapper = new LambdaQueryWrapper<ViolationAppeal>()
                .eq(query.getStudentId() != null, ViolationAppeal::getStudentId, query.getStudentId())
                .eq(query.getStatus() != null, ViolationAppeal::getStatus, query.getStatus())
                .orderByDesc(ViolationAppeal::getCreatedAt);
        return PageResult.of(violationAppealMapper.selectPage(page, wrapper));
    }

    public ViolationAppeal appealDetail(Long id) {
        ViolationAppeal appeal = violationAppealMapper.selectById(id);
        if (appeal == null) {
            throw ViolationErrorCode.APPEAL_NOT_FOUND.exception();
        }
        return appeal;
    }
}
