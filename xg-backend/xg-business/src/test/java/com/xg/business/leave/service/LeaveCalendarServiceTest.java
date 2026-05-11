package com.xg.business.leave.service;

import com.xg.business.academic.mapper.AcademicTermMapper;
import com.xg.business.leave.mapper.HolidayCalendarMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖工作时段口径:09:00–12:00 + 13:00–18:00,8h = 1 天。
 *
 * <p>简化决定:**不区分周末/节假日**——学校无法稳定拿到法定节假日数据,
 * 与其降级出错不如统一口径。每天都按工作日切片,周六全天 = 1 天。
 */
@ExtendWith(MockitoExtension.class)
class LeaveCalendarServiceTest {

    @Mock HolidayCalendarMapper holidayMapper;
    @Mock AcademicTermMapper academicTermMapper;

    LeaveCalendarService service;

    private static final ZoneOffset OFFSET = ZoneOffset.ofHours(8);

    @BeforeEach
    void setUp() {
        service = new LeaveCalendarService(holidayMapper, academicTermMapper);
    }

    private static OffsetDateTime at(int year, int month, int day, int hour, int minute) {
        return OffsetDateTime.of(year, month, day, hour, minute, 0, 0, OFFSET);
    }

    // ── 同日工作时段切片 ──────────────────────────────

    @Test
    @DisplayName("整工作日 09:00–18:00 = 1.0 天(扣午休)")
    void fullWorkDay() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 9, 0), at(2026, 5, 12, 18, 0), true);
        assertThat(d).isEqualByComparingTo("1.00");
    }

    @Test
    @DisplayName("仅上午 09:00–12:00 = 0.38 天")
    void morningOnly() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 9, 0), at(2026, 5, 12, 12, 0), true);
        assertThat(d).isEqualByComparingTo("0.38");
    }

    @Test
    @DisplayName("仅下午 13:00–18:00 = 0.63 天")
    void afternoonOnly() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 13, 0), at(2026, 5, 12, 18, 0), true);
        assertThat(d).isEqualByComparingTo("0.63");
    }

    @Test
    @DisplayName("仅午休段 12:00–13:00 = 0(不计)")
    void lunchHourOnly() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 12, 0), at(2026, 5, 12, 13, 0), true);
        assertThat(d).isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("工作时段外 19:00–22:00 = 0 天")
    void outsideHoursOnly() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 19, 0), at(2026, 5, 12, 22, 0), true);
        assertThat(d).isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("超出边界两端 08:00–19:00 仍 clamp 到 9–18(扣午休)= 1.0 天")
    void clampsToWorkingWindow() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 8, 0), at(2026, 5, 12, 19, 0), true);
        assertThat(d).isEqualByComparingTo("1.00");
    }

    @Test
    @DisplayName("用户场景:第一天 15:00–19:00 = 0.38 天(下午段相交 3h)")
    void userExampleDay1() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 15, 0), at(2026, 5, 12, 19, 0), true);
        assertThat(d).isEqualByComparingTo("0.38");
    }

    @Test
    @DisplayName("用户场景:第二天 09:00–12:00 = 0.38 天(上午段相交 3h)")
    void userExampleDay2() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 13, 9, 0), at(2026, 5, 13, 12, 0), true);
        assertThat(d).isEqualByComparingTo("0.38");
    }

    // ── 跨日 ──────────────────────────────

    @Test
    @DisplayName("连续跨日 5/12 09:00 → 5/14 18:00 = 3 个整天 = 3.0")
    void multipleFullDays() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 12, 9, 0), at(2026, 5, 14, 18, 0), true);
        assertThat(d).isEqualByComparingTo("3.00");
    }

    @Test
    @DisplayName("周末整天 = 1 天(简化口径不区分周末)— 周六 5/16 09:00–18:00 = 1.0")
    void weekendCountsAsWorkingDay() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 16, 9, 0), at(2026, 5, 16, 18, 0), true);
        assertThat(d).isEqualByComparingTo("1.00");
    }

    @Test
    @DisplayName("跨周末连续 周五 09:00 → 周一 18:00 = 4 个整天 = 4.0(周末也算)")
    void weekendsCountInRange() {
        BigDecimal d = service.calcEffectiveDays(at(2026, 5, 15, 9, 0), at(2026, 5, 18, 18, 0), true);
        assertThat(d).isEqualByComparingTo("4.00");
    }

    // ── 边界 / 异常 ──────────────────────────────

    @Test
    @DisplayName("end <= start → 0")
    void emptyRange() {
        assertThat(service.calcEffectiveDays(at(2026, 5, 12, 10, 0), at(2026, 5, 12, 10, 0), true))
                .isEqualByComparingTo("0");
        assertThat(service.calcEffectiveDays(at(2026, 5, 12, 11, 0), at(2026, 5, 12, 10, 0), true))
                .isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("null 输入 → 0")
    void nullInputs() {
        assertThat(service.calcEffectiveDays(null, at(2026, 5, 12, 18, 0), true))
                .isEqualByComparingTo("0");
        assertThat(service.calcEffectiveDays(at(2026, 5, 12, 9, 0), null, true))
                .isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("excludeHolidays 参数已废弃 — 不影响结果")
    void legacyFlagIsNoOp() {
        BigDecimal a = service.calcEffectiveDays(at(2026, 5, 12, 9, 0), at(2026, 5, 12, 18, 0), true);
        BigDecimal b = service.calcEffectiveDays(at(2026, 5, 12, 9, 0), at(2026, 5, 12, 18, 0), false);
        assertThat(a).isEqualByComparingTo(b);
    }
}
