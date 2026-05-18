package com.xg.platform.care.service;

import java.time.DayOfWeek;
import java.time.OffsetDateTime;

/**
 * "本周"口径（PRD §5.2 院系领导周一查看）：周一 00:00 起。纯函数，单测覆盖。
 * 保留入参的时区偏移（系统单时区部署，不做跨时区换算）。
 */
public final class CareWeekRange {

    private CareWeekRange() {}

    /** 入参所在自然周的周一 00:00（含 now 当天）。 */
    public static OffsetDateTime weekStart(OffsetDateTime now) {
        int backDays = now.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue();
        return now.toLocalDate()
                .minusDays(backDays)
                .atStartOfDay()
                .atOffset(now.getOffset());
    }

    /** 入参当天 00:00（下钻配额按自然日计）。 */
    public static OffsetDateTime dayStart(OffsetDateTime now) {
        return now.toLocalDate().atStartOfDay().atOffset(now.getOffset());
    }
}
