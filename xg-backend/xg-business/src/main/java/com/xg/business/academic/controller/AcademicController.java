package com.xg.business.academic.controller;

import com.xg.business.academic.dto.AcademicEventUpsert;
import com.xg.business.academic.dto.AcademicTermUpsert;
import com.xg.business.academic.dto.ClassRow;
import com.xg.business.academic.dto.ClassScheduleUpsert;
import com.xg.business.academic.dto.CurrentTermView;
import com.xg.business.academic.mapper.ClassListMapper;
import com.xg.business.academic.model.AcademicEvent;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.business.academic.model.ClassSchedule;
import com.xg.business.academic.service.AcademicEventService;
import com.xg.business.academic.service.AcademicTermService;
import com.xg.business.academic.service.ClassScheduleService;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * One controller for all 学历 (academic) endpoints — terms / events / class
 * schedules. Sized small enough that splitting into three would be more
 * boilerplate than benefit; the service layer is already split per entity.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class AcademicController {

    private final AcademicTermService termService;
    private final AcademicEventService eventService;
    private final ClassScheduleService scheduleService;
    private final ClassListMapper classListMapper;

    /* ── Academic terms ─────────────────────────────────────────── */

    @GetMapping("/api/v1/academic/terms")
    public R<List<AcademicTerm>> listTerms() {
        return R.ok(termService.list());
    }

    /** Enriched: includes computed effectiveTotalWeeks / currentWeek /
     *  phase / nextExam + nextHoliday countdowns derived from academic_event
     *  rows linked by term_code. Returns null if no term marked current. */
    @GetMapping("/api/v1/academic/terms/current")
    public R<CurrentTermView> currentTerm() {
        return R.ok(termService.getCurrentView());
    }

    @PostMapping("/api/v1/academic/terms")
    public R<AcademicTerm> createTerm(@RequestBody @Valid AcademicTermUpsert req) {
        return R.ok(termService.create(req));
    }

    @PutMapping("/api/v1/academic/terms/{id}")
    public R<AcademicTerm> updateTerm(@PathVariable Long id,
                                       @RequestBody @Valid AcademicTermUpsert req) {
        return R.ok(termService.update(id, req));
    }

    @PostMapping("/api/v1/academic/terms/{id}/set-current")
    public R<Void> setCurrentTerm(@PathVariable Long id) {
        termService.setCurrent(id);
        return R.ok();
    }

    @DeleteMapping("/api/v1/academic/terms/{id}")
    public R<Void> deleteTerm(@PathVariable Long id) {
        termService.delete(id);
        return R.ok();
    }

    /* ── Academic events (考试 / 假期) ───────────────────────────── */

    @GetMapping("/api/v1/academic/events")
    public R<List<AcademicEvent>> listEvents(
            @RequestParam(required = false) String termCode,
            @RequestParam(required = false) Boolean upcomingOnly) {
        return R.ok(eventService.list(termCode, upcomingOnly));
    }

    @PostMapping("/api/v1/academic/events")
    public R<AcademicEvent> createEvent(@RequestBody @Valid AcademicEventUpsert req) {
        return R.ok(eventService.create(req));
    }

    @PutMapping("/api/v1/academic/events/{id}")
    public R<AcademicEvent> updateEvent(@PathVariable Long id,
                                         @RequestBody @Valid AcademicEventUpsert req) {
        return R.ok(eventService.update(id, req));
    }

    @DeleteMapping("/api/v1/academic/events/{id}")
    public R<Void> deleteEvent(@PathVariable Long id) {
        eventService.delete(id);
        return R.ok();
    }

    /* ── Class schedules (按 班级 × 学期 一行) ──────────────────── */

    @GetMapping("/api/v1/academic/class-schedules")
    public R<List<ClassSchedule>> listSchedules(
            @RequestParam(required = false) Long classId,
            @RequestParam(required = false) String termCode) {
        return R.ok(scheduleService.list(classId, termCode));
    }

    /** Student-side endpoint: returns the caller's class schedule for the
     *  given term. Resolves the class from the caller's student_profile.
     *  Returns null when the caller isn't a student or no schedule exists. */
    @GetMapping("/api/v1/academic/class-schedules/me")
    public R<ClassSchedule> myClassSchedule(@RequestParam String termCode) {
        Long userId = CurrentUser.id();
        return R.ok(scheduleService.getMine(userId, termCode));
    }

    /** Upsert by (classId, termCode) — same input creates or replaces. Used
     *  by both the manual admin editor and (eventually) the external sync. */
    @PostMapping("/api/v1/academic/class-schedules")
    public R<ClassSchedule> upsertSchedule(@RequestBody @Valid ClassScheduleUpsert req) {
        Long userId = CurrentUser.id();
        return R.ok(scheduleService.upsert(req, userId));
    }

    @DeleteMapping("/api/v1/academic/class-schedules/{id}")
    public R<Void> deleteSchedule(@PathVariable Long id) {
        scheduleService.delete(id);
        return R.ok();
    }

    /** Lightweight class list for the schedule admin editor's class picker. */
    @GetMapping("/api/v1/academic/classes")
    public R<List<ClassRow>> listClasses() {
        return R.ok(classListMapper.listClasses());
    }
}
