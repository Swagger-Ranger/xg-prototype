package com.xg.business.academic.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.xg.business.academic.dto.AcademicTermUpsert;
import com.xg.business.academic.dto.CurrentTermView;
import com.xg.business.academic.mapper.AcademicEventMapper;
import com.xg.business.academic.mapper.AcademicTermMapper;
import com.xg.business.academic.model.AcademicEvent;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AcademicTermService {

    private final AcademicTermMapper mapper;
    private final AcademicEventMapper eventMapper;

    public List<AcademicTerm> list() {
        return mapper.selectList(
                new LambdaQueryWrapper<AcademicTerm>()
                        .orderByDesc(AcademicTerm::getStartDate));
    }

    public AcademicTerm getCurrent() {
        return mapper.selectOne(
                new LambdaQueryWrapper<AcademicTerm>()
                        .eq(AcademicTerm::getIsCurrent, true)
                        .last("LIMIT 1"));
    }

    /**
     * Build the rich view of the current term for the campus dashboard.
     * Returns null when no term is marked current — admin needs to flip one
     * via /set-current first.
     */
    public CurrentTermView getCurrentView() {
        AcademicTerm t = getCurrent();
        if (t == null) return null;
        List<AcademicEvent> events = eventMapper.selectList(
                new LambdaQueryWrapper<AcademicEvent>()
                        .eq(AcademicEvent::getTermCode, t.getCode()));
        return computeView(t, events, LocalDate.now());
    }

    /** Pure compute (package-private so unit tests can drive it). */
    static CurrentTermView computeView(AcademicTerm term, List<AcademicEvent> events, LocalDate today) {
        CurrentTermView v = new CurrentTermView();
        v.setId(term.getId());
        v.setCode(term.getCode());
        v.setName(term.getName());
        v.setStartDate(term.getStartDate());
        v.setEndDate(term.getEndDate());
        v.setTotalWeeksConfigured(term.getTotalWeeks());

        Optional<AcademicEvent> finalExam = events.stream()
                .filter(e -> "exam_final".equals(e.getEventType()))
                .min(Comparator.comparing(AcademicEvent::getStartDate));

        // Teaching ends the day before final exam if scheduled, else at term end.
        LocalDate teachingEnd = finalExam.map(e -> e.getStartDate().minusDays(1))
                .orElse(term.getEndDate());

        // ── effective total weeks ──
        int teachingSpanDays = (int) ChronoUnit.DAYS.between(term.getStartDate(), teachingEnd) + 1;
        int holidayDaysInSpan = sumHolidayDays(events, term.getStartDate(), teachingEnd);
        int effectiveDays = Math.max(0, teachingSpanDays - holidayDaysInSpan);
        int effectiveWeeks = effectiveDays > 0 ? (int) Math.ceil(effectiveDays / 7.0) : 0;
        if (effectiveWeeks <= 0 && term.getTotalWeeks() != null) {
            effectiveWeeks = term.getTotalWeeks();
        }
        v.setEffectiveTotalWeeks(effectiveWeeks);

        // ── current week ──
        int currentWeek;
        if (today.isBefore(term.getStartDate())) {
            currentWeek = 0;
        } else if (today.isAfter(teachingEnd)) {
            currentWeek = effectiveWeeks;
        } else {
            int elapsedDays = (int) ChronoUnit.DAYS.between(term.getStartDate(), today) + 1;
            int holidayDaysToToday = sumHolidayDays(events, term.getStartDate(), today);
            int effectiveElapsed = Math.max(1, elapsedDays - holidayDaysToToday);
            currentWeek = Math.min(effectiveWeeks, (int) Math.ceil(effectiveElapsed / 7.0));
        }
        v.setCurrentWeek(currentWeek);

        // ── phase ──
        v.setPhase(computePhase(term, events, today, finalExam.orElse(null)));

        // ── countdowns ──
        finalExam
                .filter(e -> !today.isAfter(e.getEndDate()))
                .ifPresent(e -> {
                    v.setNextExam(e);
                    v.setDaysToExam(Math.max(0, (int) ChronoUnit.DAYS.between(today, e.getStartDate())));
                });
        events.stream()
                .filter(e -> "holiday".equals(e.getEventType()))
                .filter(e -> !today.isAfter(e.getEndDate()))
                .min(Comparator.comparing(AcademicEvent::getStartDate))
                .ifPresent(e -> {
                    v.setNextHoliday(e);
                    v.setDaysToNextHoliday(Math.max(0, (int) ChronoUnit.DAYS.between(today, e.getStartDate())));
                });

        v.setDaysToTermEnd((int) ChronoUnit.DAYS.between(today, term.getEndDate()));
        return v;
    }

    /** Total holiday days that fall within [windowStart, windowEnd] inclusive. */
    private static int sumHolidayDays(List<AcademicEvent> events, LocalDate windowStart, LocalDate windowEnd) {
        int total = 0;
        for (AcademicEvent e : events) {
            if (!"holiday".equals(e.getEventType())) continue;
            LocalDate hStart = e.getStartDate().isBefore(windowStart) ? windowStart : e.getStartDate();
            LocalDate hEnd = e.getEndDate().isAfter(windowEnd) ? windowEnd : e.getEndDate();
            if (!hStart.isAfter(hEnd)) {
                total += (int) ChronoUnit.DAYS.between(hStart, hEnd) + 1;
            }
        }
        return total;
    }

    private static String computePhase(AcademicTerm term, List<AcademicEvent> events, LocalDate today, AcademicEvent finalExam) {
        if (today.isBefore(term.getStartDate())) return "pre_term";
        if (today.isAfter(term.getEndDate())) return "post_term";
        if (finalExam != null
                && !today.isBefore(finalExam.getStartDate())
                && !today.isAfter(finalExam.getEndDate())) {
            return "exam";
        }
        for (AcademicEvent e : events) {
            if (!"holiday".equals(e.getEventType())) continue;
            if (!today.isBefore(e.getStartDate()) && !today.isAfter(e.getEndDate())) {
                return "holiday";
            }
        }
        return "teaching";
    }

    @Transactional
    public AcademicTerm create(AcademicTermUpsert req) {
        validate(req);
        AcademicTerm t = new AcademicTerm();
        applyFrom(t, req);
        // Defer is_current flip until after insert — keeps the partial unique
        // index from rejecting the row before we've cleared the previous one.
        boolean wantsCurrent = Boolean.TRUE.equals(req.getIsCurrent());
        t.setIsCurrent(false);
        mapper.insert(t);
        if (wantsCurrent) setCurrent(t.getId());
        return mapper.selectById(t.getId());
    }

    @Transactional
    public AcademicTerm update(Long id, AcademicTermUpsert req) {
        AcademicTerm t = mustGet(id);
        validate(req);
        applyFrom(t, req);
        boolean wantsCurrent = Boolean.TRUE.equals(req.getIsCurrent());
        t.setIsCurrent(false);
        mapper.updateById(t);
        if (wantsCurrent) setCurrent(t.getId());
        return mapper.selectById(id);
    }

    /**
     * Mark the given term as current, clearing any other tenant-scoped current
     * flag in the same transaction. V087 加了 partial unique index
     * {@code uq_academic_term_current_per_tenant} 兜底,所以即便两个 admin 并发
     * setCurrent 不同 term,后落地的 INSERT/UPDATE 会被 PG 拒绝(唯一冲突),
     * 不会出现双 current 的脏状态。这里维持「先清旧、再设新」的顺序,在单笔
     * 事务里写两次,绝大多数场景一次过;并发冲突时让索引报错由调用方重试。
     */
    @Transactional
    public void setCurrent(Long id) {
        AcademicTerm t = mustGet(id);
        // Clear all other current flags for this tenant first.
        mapper.update(null,
                new LambdaUpdateWrapper<AcademicTerm>()
                        .ne(AcademicTerm::getId, id)
                        .eq(AcademicTerm::getIsCurrent, true)
                        .set(AcademicTerm::getIsCurrent, false));
        t.setIsCurrent(true);
        mapper.updateById(t);
    }

    public void delete(Long id) {
        AcademicTerm t = mustGet(id);
        if (Boolean.TRUE.equals(t.getIsCurrent())) {
            throw new BizException("TERM_IS_CURRENT", "当前学期不可删除，请先把另一学期设为当前");
        }
        mapper.deleteById(id);
    }

    private AcademicTerm mustGet(Long id) {
        AcademicTerm t = mapper.selectById(id);
        if (t == null) throw new BizException("TERM_NOT_FOUND", "学期不存在");
        return t;
    }

    private void validate(AcademicTermUpsert req) {
        if (req.getStartDate().isAfter(req.getEndDate())) {
            throw new BizException("INVALID_TERM_DATES", "开学日期不能晚于结束日期");
        }
        if (req.getTotalWeeks() <= 0 || req.getTotalWeeks() > 60) {
            throw new BizException("INVALID_TERM_WEEKS", "教学周数应在 1-60 之间");
        }
    }

    private void applyFrom(AcademicTerm t, AcademicTermUpsert req) {
        t.setCode(req.getCode());
        t.setName(req.getName());
        t.setStartDate(req.getStartDate());
        t.setEndDate(req.getEndDate());
        t.setTotalWeeks(req.getTotalWeeks());
    }
}
