package com.xg.business.violation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.violation.dto.PunishmentCreateRequest;
import com.xg.business.violation.dto.PunishmentQueryRequest;
import com.xg.business.violation.dto.ViolationCreateRequest;
import com.xg.business.violation.dto.ViolationQueryRequest;
import com.xg.business.violation.mapper.PunishmentMapper;
import com.xg.business.violation.mapper.ViolationRecordMapper;
import com.xg.business.violation.model.Punishment;
import com.xg.business.violation.model.ViolationRecord;
import com.xg.common.base.PageResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ViolationService {

    private final ViolationRecordMapper violationRecordMapper;
    private final PunishmentMapper punishmentMapper;

    @Transactional
    public ViolationRecord recordViolation(ViolationCreateRequest req, Long recorderId, String recorderName) {
        ViolationRecord record = new ViolationRecord();
        record.setStudentId(req.getStudentId());
        record.setStudentName(req.getStudentName());
        record.setCategory(req.getCategory());
        record.setOccurredAt(req.getOccurredAt());
        record.setLocation(req.getLocation());
        record.setDescription(req.getDescription());
        record.setRecorderId(recorderId);
        record.setRecorderName(recorderName);
        violationRecordMapper.insert(record);
        return record;
    }

    public PageResult<ViolationRecord> listViolations(ViolationQueryRequest query) {
        Page<ViolationRecord> page = query.toPage();
        LambdaQueryWrapper<ViolationRecord> wrapper = new LambdaQueryWrapper<ViolationRecord>()
                .eq(query.getStudentId() != null, ViolationRecord::getStudentId, query.getStudentId())
                .eq(query.getCategory() != null, ViolationRecord::getCategory, query.getCategory())
                .ge(query.getStartDate() != null, ViolationRecord::getOccurredAt, query.getStartDate() == null ? null : query.getStartDate().atStartOfDay())
                .le(query.getEndDate() != null, ViolationRecord::getOccurredAt, query.getEndDate() == null ? null : query.getEndDate().plusDays(1).atStartOfDay())
                .orderByDesc(ViolationRecord::getOccurredAt);
        return PageResult.of(violationRecordMapper.selectPage(page, wrapper));
    }

    public ViolationRecord violationDetail(Long id) {
        ViolationRecord record = violationRecordMapper.selectById(id);
        if (record == null) {
            throw ViolationErrorCode.VIOLATION_NOT_FOUND.exception();
        }
        return record;
    }

    @Transactional
    public Punishment issuePunishment(PunishmentCreateRequest req, Long issuerId, String issuerName) {
        Punishment p = new Punishment();
        p.setViolationRecordId(req.getViolationRecordId());
        p.setStudentId(req.getStudentId());
        p.setStudentName(req.getStudentName());
        p.setLevel(req.getLevel());
        p.setReason(req.getReason());
        p.setEffectiveDate(req.getEffectiveDate());
        p.setExpiryDate(req.getExpiryDate());
        p.setStatus("effective");
        p.setIssuerId(issuerId);
        p.setIssuerName(issuerName);
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
}
