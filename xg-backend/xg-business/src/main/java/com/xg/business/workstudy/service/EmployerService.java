package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerQueryRequest;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmployerService {

    private final EmployerMapper employerMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public Employer create(EmployerCreateRequest req) {
        Employer e = new Employer();
        e.setName(req.getName());
        e.setLeaderUserId(req.getLeaderUserId());
        e.setOperatorUserIds(toJson(req.getOperatorUserIds()));
        e.setContactName(req.getContactName());
        e.setContactPhone(req.getContactPhone());
        e.setEmail(req.getEmail());
        e.setStatus("active");
        e.setAllowSelfArrange(Boolean.TRUE.equals(req.getAllowSelfArrange()));
        e.setRemark(req.getRemark());
        employerMapper.insert(e);
        return e;
    }

    @Transactional
    public Employer update(Long id, EmployerUpdateRequest req) {
        Employer e = detail(id);
        if (req.getName() != null) e.setName(req.getName());
        if (req.getLeaderUserId() != null) e.setLeaderUserId(req.getLeaderUserId());
        if (req.getOperatorUserIds() != null) e.setOperatorUserIds(toJson(req.getOperatorUserIds()));
        if (req.getContactName() != null) e.setContactName(req.getContactName());
        if (req.getContactPhone() != null) e.setContactPhone(req.getContactPhone());
        if (req.getEmail() != null) e.setEmail(req.getEmail());
        if (req.getAllowSelfArrange() != null) e.setAllowSelfArrange(req.getAllowSelfArrange());
        if (req.getRemark() != null) e.setRemark(req.getRemark());
        employerMapper.updateById(e);
        return e;
    }

    @Transactional
    public void setStatus(Long id, String status) {
        if (!"active".equals(status) && !"disabled".equals(status)) {
            throw new BizException("INVALID_STATUS", "状态只能是 active / disabled");
        }
        Employer e = detail(id);
        e.setStatus(status);
        employerMapper.updateById(e);
    }

    public Employer detail(Long id) {
        Employer e = employerMapper.selectById(id);
        if (e == null) throw new BizException("EMPLOYER_NOT_FOUND", "用人单位不存在");
        return e;
    }

    public PageResult<Employer> list(EmployerQueryRequest q) {
        Page<Employer> page = q.toPage();
        LambdaQueryWrapper<Employer> wrapper = new LambdaQueryWrapper<Employer>()
                .like(q.getKeyword() != null && !q.getKeyword().isBlank(), Employer::getName, q.getKeyword())
                .eq(q.getStatus() != null, Employer::getStatus, q.getStatus())
                .eq(q.getLeaderUserId() != null, Employer::getLeaderUserId, q.getLeaderUserId())
                .orderByDesc(Employer::getCreatedAt);
        return PageResult.of(employerMapper.selectPage(page, wrapper));
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize employer field: {}", e.getMessage());
            return null;
        }
    }
}
