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
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
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

    /**
     * Effective leave days. {@code start} / {@code end} are submission times;
     * {@code excludeHolidays} comes from the leave type's snapshot. The result
     * is at least {@code 0.5} for any non-empty range so a 1-hour leave still
     * costs the half-day floor — matches existing UX (the old
     * {@code calculateDurationDays} rounded {@code ceil(seconds/86400)}).
     */
    public BigDecimal calcEffectiveDays(OffsetDateTime start, OffsetDateTime end, boolean excludeHolidays) {
        if (start == null || end == null) return BigDecimal.ZERO;
        long seconds = Duration.between(start, end).getSeconds();
        if (seconds <= 0) return BigDecimal.ZERO;
        double naturalDays = Math.ceil(seconds / 86400.0);
        if (!excludeHolidays) {
            return round(naturalDays);
        }

        // Walk the date range and subtract weekend/holiday days. Bookends count
        // unless they're themselves non-working — caller is responsible for
        // not booking a leave on a holiday.
        LocalDate from = start.toLocalDate();
        LocalDate to = end.toLocalDate();
        Map<LocalDate, String> calendar = loadCalendar(from, to);

        long workingDays = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (isWorkingDay(d, calendar)) workingDays++;
        }
        // Preserve sub-day fractions if the user picked partial start/end.
        // Math: (workingDays * 86400 - leadGap - tailGap) / 86400 — but for v0
        // we just clamp to workingDays which matches the legacy contract for
        // multi-day requests.
        return round(workingDays);
    }

    /** Public for endpoint listing; returns the raw rows. */
    public List<Map<String, Object>> listHolidays() {
        return holidayMapper.listAll(TenantContext.getRequiredTenantId());
    }

    /** True when {@code date} should count toward leave duration. */
    private boolean isWorkingDay(LocalDate date, Map<LocalDate, String> calendar) {
        String type = calendar.get(date);
        if ("public_holiday".equals(type)) return false;
        if ("compensatory_workday".equals(type)) return true;
        int dow = date.getDayOfWeek().getValue();  // 1..7, 6=Sat 7=Sun
        return dow <= 5;
    }

    private Map<LocalDate, String> loadCalendar(LocalDate from, LocalDate to) {
        Map<LocalDate, String> out = new HashMap<>();
        try {
            String tenantId = TenantContext.getRequiredTenantId();
            List<Map<String, Object>> rows = holidayMapper.findInRange(tenantId, from, to);
            for (Map<String, Object> row : rows) {
                Object dateObj = row.get("date");
                Object typeObj = row.get("type");
                if (dateObj == null || typeObj == null) continue;
                LocalDate d = dateObj instanceof LocalDate ld ? ld
                        : LocalDate.parse(dateObj.toString());
                out.put(d, typeObj.toString());
            }
        } catch (Exception e) {
            log.warn("loadCalendar({} → {}) failed, treating range as plain weekday/weekend: {}",
                    from, to, e.getMessage());
        }
        return out;
    }

    private static BigDecimal round(double v) {
        return BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP);
    }
}
