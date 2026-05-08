package com.xg.business.academic.service;

import com.xg.business.academic.dto.CurrentTermView;
import com.xg.business.academic.model.AcademicEvent;
import com.xg.business.academic.model.AcademicTerm;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test for AcademicTermService.computeView (the static derivation
 * logic). Hits the package-private method via reflection so we don't have
 * to expose it for the sake of testing.
 *
 * Numbers are pinned to the demo seed (V073__seed_academic_data.sql) so a
 * developer can sanity-check by eyeballing the dashboard against these
 * expectations.
 */
class AcademicTermServiceTest {

    /* ── seed mirror ────────────────────────────────────────────── */

    private AcademicTerm seedTerm() {
        AcademicTerm t = new AcademicTerm();
        t.setId(3001L);
        t.setCode("2025-2026-2");
        t.setName("2025-2026 学年第二学期");
        t.setStartDate(LocalDate.of(2026, 2, 23));
        t.setEndDate(LocalDate.of(2026, 7, 12));
        t.setTotalWeeks(20);
        t.setIsCurrent(true);
        return t;
    }

    private AcademicEvent event(String type, String name, LocalDate start, LocalDate end) {
        AcademicEvent e = new AcademicEvent();
        e.setEventType(type);
        e.setName(name);
        e.setStartDate(start);
        e.setEndDate(end);
        e.setTermCode("2025-2026-2");
        e.setGranularity("day");
        return e;
    }

    private List<AcademicEvent> seedEvents() {
        return List.of(
                event("exam_final", "期末考试", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30)),
                event("holiday", "暑假", LocalDate.of(2026, 7, 13), LocalDate.of(2026, 8, 31)),
                event("holiday", "端午节", LocalDate.of(2026, 6, 19), LocalDate.of(2026, 6, 21)),
                event("holiday", "劳动节", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5))
        );
    }

    /* ── invocation helper ──────────────────────────────────────── */

    private CurrentTermView invoke(LocalDate today) throws Exception {
        Method m = AcademicTermService.class.getDeclaredMethod(
                "computeView", AcademicTerm.class, List.class, LocalDate.class);
        m.setAccessible(true);
        return (CurrentTermView) m.invoke(null, seedTerm(), seedEvents(), today);
    }

    /* ── tests ──────────────────────────────────────────────────── */

    @Test
    void teachingPhase_subtractsLaborDayHolidays() throws Exception {
        // 2026-05-06 — exact "today" used in the verification doc.
        // Teaching span: 2026-02-23 → 2026-05-31 (98d) minus 劳动节 5d = 93d → 14 wk.
        // Days elapsed:   2026-02-23 → 2026-05-06 (73d) minus 劳动节 5d = 68d → 10 wk.
        CurrentTermView v = invoke(LocalDate.of(2026, 5, 6));

        assertThat(v.getEffectiveTotalWeeks()).isEqualTo(14);
        assertThat(v.getCurrentWeek()).isEqualTo(10);
        assertThat(v.getPhase()).isEqualTo("teaching");
        assertThat(v.getDaysToExam()).isEqualTo(26);   // 5-6 → 6-1
        assertThat(v.getNextExam().getName()).isEqualTo("期末考试");
        assertThat(v.getDaysToTermEnd()).isEqualTo(67); // 5-6 → 7-12
    }

    @Test
    void preTerm_currentWeekZero() throws Exception {
        CurrentTermView v = invoke(LocalDate.of(2026, 1, 15));

        assertThat(v.getCurrentWeek()).isZero();
        assertThat(v.getPhase()).isEqualTo("pre_term");
    }

    @Test
    void duringHolidayWindow_phaseHoliday() throws Exception {
        // 2026-05-03 falls inside 劳动节 (5-1 to 5-5).
        CurrentTermView v = invoke(LocalDate.of(2026, 5, 3));
        assertThat(v.getPhase()).isEqualTo("holiday");
    }

    @Test
    void duringFinalExam_phaseExam() throws Exception {
        CurrentTermView v = invoke(LocalDate.of(2026, 6, 10));
        assertThat(v.getPhase()).isEqualTo("exam");
        // Past teaching end → currentWeek caps at effective total.
        assertThat(v.getCurrentWeek()).isEqualTo(v.getEffectiveTotalWeeks());
        assertThat(v.getDaysToExam()).isZero(); // exam already started
    }

    @Test
    void postTerm_phasePostTerm() throws Exception {
        CurrentTermView v = invoke(LocalDate.of(2026, 8, 1));
        assertThat(v.getPhase()).isEqualTo("post_term");
        // daysToTermEnd is now negative (past end_date 7-12).
        assertThat(v.getDaysToTermEnd()).isLessThan(0);
    }

    @Test
    void noFinalExam_fallsBackToTotalWeeksConfigured() throws Exception {
        // Drop the exam_final from events; teachingEnd then = term.endDate.
        List<AcademicEvent> noExam = seedEvents().stream()
                .filter(e -> !"exam_final".equals(e.getEventType()))
                .toList();
        Method m = AcademicTermService.class.getDeclaredMethod(
                "computeView", AcademicTerm.class, List.class, LocalDate.class);
        m.setAccessible(true);
        CurrentTermView v = (CurrentTermView) m.invoke(null, seedTerm(), noExam, LocalDate.of(2026, 5, 6));

        // Span 2-23 → 7-12 = 140d; minus 端午 3d + 劳动节 5d (暑假 starts 7-13, outside) = 132d → 19 weeks.
        assertThat(v.getEffectiveTotalWeeks()).isEqualTo(19);
        assertThat(v.getNextExam()).isNull();
    }

    @Test
    void nextHoliday_picksClosestUpcoming() throws Exception {
        // 2026-04-15 → next holiday is 劳动节 (5-1).
        CurrentTermView v = invoke(LocalDate.of(2026, 4, 15));
        assertThat(v.getNextHoliday().getName()).isEqualTo("劳动节");
        assertThat(v.getDaysToNextHoliday()).isEqualTo(16);
    }
}
