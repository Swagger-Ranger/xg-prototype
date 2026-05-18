package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯单测："本周一 00:00" 与 "当天 00:00" 口径。 */
class CareWeekRangeTest {

    private static final ZoneOffset CST = ZoneOffset.ofHours(8);

    @Test
    void wednesday_rolls_back_to_monday_midnight() {
        // 2026-05-13 是周三
        OffsetDateTime wed = OffsetDateTime.of(2026, 5, 13, 15, 30, 0, 0, CST);
        OffsetDateTime ws = CareWeekRange.weekStart(wed);
        assertThat(ws.toString()).isEqualTo("2026-05-11T00:00+08:00"); // 周一
    }

    @Test
    void monday_is_its_own_week_start() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 11, 9, 0, 0, 0, CST);
        assertThat(CareWeekRange.weekStart(mon).toString())
                .isEqualTo("2026-05-11T00:00+08:00");
    }

    @Test
    void sunday_belongs_to_that_weeks_monday() {
        // 2026-05-17 是周日 → 本周一仍是 05-11
        OffsetDateTime sun = OffsetDateTime.of(2026, 5, 17, 23, 59, 0, 0, CST);
        assertThat(CareWeekRange.weekStart(sun).toString())
                .isEqualTo("2026-05-11T00:00+08:00");
    }

    @Test
    void day_start_zeroes_the_time_keeps_offset() {
        OffsetDateTime t = OffsetDateTime.of(2026, 5, 17, 23, 59, 0, 0, CST);
        assertThat(CareWeekRange.dayStart(t).toString())
                .isEqualTo("2026-05-17T00:00+08:00");
    }
}
