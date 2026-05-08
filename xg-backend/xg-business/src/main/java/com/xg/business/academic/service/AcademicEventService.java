package com.xg.business.academic.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.academic.dto.AcademicEventUpsert;
import com.xg.business.academic.mapper.AcademicEventMapper;
import com.xg.business.academic.model.AcademicEvent;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AcademicEventService {

    private final AcademicEventMapper mapper;

    public List<AcademicEvent> list(String termCode, Boolean upcomingOnly) {
        LambdaQueryWrapper<AcademicEvent> w = new LambdaQueryWrapper<>();
        if (termCode != null && !termCode.isBlank()) {
            w.eq(AcademicEvent::getTermCode, termCode);
        }
        if (Boolean.TRUE.equals(upcomingOnly)) {
            // "Upcoming" = end_date >= today. Past events drop out so the
            // dashboard's countdown list doesn't carry corpses.
            w.ge(AcademicEvent::getEndDate, LocalDate.now());
        }
        w.orderByAsc(AcademicEvent::getStartDate);
        return mapper.selectList(w);
    }

    @Transactional
    public AcademicEvent create(AcademicEventUpsert req) {
        validate(req);
        AcademicEvent e = new AcademicEvent();
        applyFrom(e, req);
        mapper.insert(e);
        return mapper.selectById(e.getId());
    }

    @Transactional
    public AcademicEvent update(Long id, AcademicEventUpsert req) {
        AcademicEvent e = mustGet(id);
        validate(req);
        applyFrom(e, req);
        mapper.updateById(e);
        return mapper.selectById(id);
    }

    public void delete(Long id) {
        mustGet(id);
        mapper.deleteById(id);
    }

    private AcademicEvent mustGet(Long id) {
        AcademicEvent e = mapper.selectById(id);
        if (e == null) throw new BizException("EVENT_NOT_FOUND", "学历事件不存在");
        return e;
    }

    private void validate(AcademicEventUpsert req) {
        if (req.getStartDate().isAfter(req.getEndDate())) {
            throw new BizException("INVALID_EVENT_DATES", "开始日期不能晚于结束日期");
        }
    }

    private void applyFrom(AcademicEvent e, AcademicEventUpsert req) {
        e.setTermCode(req.getTermCode());
        e.setEventType(req.getEventType());
        e.setName(req.getName());
        e.setStartDate(req.getStartDate());
        e.setEndDate(req.getEndDate());
        e.setGranularity(req.getGranularity() != null ? req.getGranularity() : "day");
        e.setNotes(req.getNotes());
    }
}
