package com.xg.business.academic.dto;

import com.xg.business.academic.model.AcademicEvent;
import lombok.Data;

import java.time.LocalDate;

/**
 * Enriched view of the current term — used by the campus dashboard's welcome
 * strip and the 学期进度环.
 *
 * <p>Most fields are computed at request time from {@link AcademicEvent}
 * records linked by term_code:
 * <ul>
 *   <li>{@code effectiveTotalWeeks} = teaching weeks span (term start →
 *       期末考试 start - 1d) minus 假期 days that overlap that span,
 *       rounded up to weeks. Falls back to {@code totalWeeksConfigured}
 *       when no 期末考试 event is set.</li>
 *   <li>{@code currentWeek} = number of teaching weeks elapsed today,
 *       skipping 假期 days. 0 before term starts, capped at
 *       {@code effectiveTotalWeeks} after teaching ends.</li>
 *   <li>{@code phase} = pre_term / teaching / exam / holiday / post_term —
 *       which segment of the term today sits in.</li>
 * </ul>
 */
@Data
public class CurrentTermView {

    // Term identity (mirror of AcademicTerm columns)
    private Long id;
    private String code;
    private String name;
    private LocalDate startDate;
    private LocalDate endDate;

    /** Raw configured value the admin entered. Use as a fallback only. */
    private Integer totalWeeksConfigured;

    /** Computed teaching weeks count. Equals totalWeeksConfigured when no
     *  exam_final event is configured. */
    private Integer effectiveTotalWeeks;

    /** 0 = before term starts, 1..effectiveTotalWeeks during teaching,
     *  effectiveTotalWeeks while in exam, capped after. */
    private Integer currentWeek;

    /** pre_term / teaching / exam / holiday / post_term */
    private String phase;

    /** The upcoming exam_final event for this term, if scheduled and
     *  not yet ended. null when no exam set or it's already past. */
    private AcademicEvent nextExam;
    /** Days from today to nextExam.startDate; null when no nextExam. */
    private Integer daysToExam;

    /** Next upcoming holiday (start_date >= today). null when none. */
    private AcademicEvent nextHoliday;
    private Integer daysToNextHoliday;

    /** Days from today to term.endDate; negative when post-term. */
    private Integer daysToTermEnd;
}
