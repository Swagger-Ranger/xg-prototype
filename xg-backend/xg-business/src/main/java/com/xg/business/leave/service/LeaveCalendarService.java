package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.xg.business.academic.mapper.AcademicTermMapper;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.business.leave.mapper.HolidayCalendarMapper;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Computes effective leave days respecting weekends + the tenant's
 * {@code holiday_calendar}. Used by both the submission path
 * ({@code LeaveService.apply}) and the dry-run engine.
 *
 * <p>Calendar rules (v0 — covers the 90% case):
 * <ul>
 *   <li>{@code excludeHolidays=false} (default): naïve {@code ceil((end-start)/86400)},
 *       i.e. count every calendar day. This is what {@code LeaveService} did
 *       before #2 landed.</li>
 *   <li>{@code excludeHolidays=true}: walk each day in the range; skip weekends
 *       unless the {@code holiday_calendar} marks the date {@code compensatory_workday},
 *       and skip weekdays the calendar marks {@code public_holiday}. Round to
 *       1 decimal place.</li>
 * </ul>
 *
 * <p><b>Half-day edge case</b>: when {@code excludeHolidays=true} we still
 * preserve sub-day fractions for the start/end days (e.g. afternoon-leave),
 * by anchoring on the duration in seconds and only subtracting full
 * holiday/weekend days that fall <em>between</em> the bookends.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveCalendarService {

    private final HolidayCalendarMapper holidayMapper;
    private final AcademicTermMapper academicTermMapper;

    /**
     * 教育部令 41 号红线：单学期请假 / 缺课累计超过总学时三分之一即触发休学。
     * 我们以"工作日"近似学时——学期总工作日 ≈ {@code totalWeeks × 5}（按每周
     * 5 个工作日计），1/3 红线天数 ≈ {@code totalWeeks × 5 / 3}。
     *
     * <p>返回值供 wizard 输入提示和 dry-run 校验用：如果 {@code termCapDays}
     * 或学生当前学期累计假期超过该值，前端 / 引擎应警告"将触发休学条件"。
     *
     * <p>没有当前学期记录时返回 {@code null}，调用方应跳过校验而不是误报。
     */
    public Integer calcTermLeaveCapDays() {
        try {
            AcademicTerm term = academicTermMapper.selectOne(
                    new QueryWrapper<AcademicTerm>().eq("is_current", true));
            if (term == null || term.getTotalWeeks() == null) return null;
            int totalWeeks = term.getTotalWeeks();
            // ceil(totalWeeks * 5 / 3.0) — round up so the warning fires before
            // the legal threshold, never after.
            return (int) Math.ceil(totalWeeks * 5.0 / 3.0);
        } catch (Exception e) {
            log.warn("calcTermLeaveCapDays failed: {}", e.getMessage());
            return null;
        }
    }

    /** 工作时段:上午 slot 09:00–12:00,下午 slot 13:00–18:00。一天 = 2 slot,每 slot = 0.5 天。 */
    private static final LocalTime MORNING_START = LocalTime.of(9, 0);
    private static final LocalTime MORNING_END = LocalTime.of(12, 0);
    private static final LocalTime AFTERNOON_START = LocalTime.of(13, 0);
    private static final LocalTime AFTERNOON_END = LocalTime.of(18, 0);

    /**
     * 请假天数 = 区间内被占用的"半日 slot"数 × 0.5。规则:
     * <ul>
     *   <li>每个日历日两个 slot:上午 {@code 09:00–12:00} / 下午 {@code 13:00–18:00}</li>
     *   <li>请假区间与 slot 有任何重叠即算占用,+0.5 天(午休 12:00–13:00 自身不构成 slot,
     *       仅落在午休里的极端请假返回 0)</li>
     *   <li><b>不区分周末/节假日</b>——每天都当工作日切。学校拿不到稳定法定假期数据,
     *       公平 ≥ 完美;周末全天请假 = 1 天,接受这个轻微不公平的边界</li>
     *   <li>结果落在 0.5 倍数,scale=2 跟 NUMERIC(5,2) 列对齐</li>
     * </ul>
     *
     * <p>{@code excludeHolidays} 参数保留只为 backward-compat,实际无效。
     */
    public BigDecimal calcEffectiveDays(OffsetDateTime start, OffsetDateTime end, boolean excludeHolidays) {
        if (start == null || end == null) return BigDecimal.ZERO;
        if (!end.isAfter(start)) return BigDecimal.ZERO;

        LocalDate from = start.toLocalDate();
        LocalDate to = end.toLocalDate();

        int halfSlots = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (slotCovered(d, MORNING_START, MORNING_END, start, end)) halfSlots++;
            if (slotCovered(d, AFTERNOON_START, AFTERNOON_END, start, end)) halfSlots++;
        }

        return BigDecimal.valueOf(halfSlots)
                .divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
    }

    /**
     * 请假区间是否与 day 的指定 slot 有任何重叠。
     * 经典区间相交:{@code reqStart < segEnd && reqEnd > segStart}。
     */
    private boolean slotCovered(LocalDate day, LocalTime segStart, LocalTime segEnd,
                                 OffsetDateTime reqStart, OffsetDateTime reqEnd) {
        OffsetDateTime segStartDt = day.atTime(segStart).atOffset(reqStart.getOffset());
        OffsetDateTime segEndDt = day.atTime(segEnd).atOffset(reqStart.getOffset());
        return reqStart.isBefore(segEndDt) && reqEnd.isAfter(segStartDt);
    }

    /** Public for endpoint listing; returns the raw rows. */
    public List<Map<String, Object>> listHolidays() {
        return holidayMapper.listAll(TenantContext.getRequiredTenantId());
    }

}
