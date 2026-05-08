package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.weather.client.WeatherClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-tenant scan that fires the four time-based leave reminders:
 *
 * <ul>
 *   <li><b>start</b> (mask bit 1): student is reminded 0–2h before start_time;
 *       pairs with the per-leave-type 关怀短句 (zero-token templates).</li>
 *   <li><b>pre_end</b> (bit 2): student is nudged 0–2h before end_time so they
 *       can prepare to come back and 销假.</li>
 *   <li><b>due</b> (bit 4): once end_time has passed, if status is still
 *       {@code approved} (i.e. 销假 not yet submitted), student gets a soft
 *       "请尽快销假" within the first 2 hours.</li>
 *   <li><b>overdue</b> (bit 8): past end_time + 2h, escalate — student gets an
 *       urgent reminder, and the student's counselor(s) are notified so they
 *       can follow up.</li>
 * </ul>
 *
 * <p>Each reminder fires at most once per leave: after a successful send the
 * scan ORs the corresponding bit into {@code leave_request.reminder_sent_mask},
 * and the LambdaQuery filter excludes already-fired rows.
 *
 * <p>Tenant context is set by {@link com.xg.business.leave.scheduler.LeaveReminderScheduler}
 * before each call to {@link #scanCurrentTenant()}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveReminderService {

    static final int MASK_START   = 1;
    static final int MASK_PRE_END = 2;
    static final int MASK_DUE     = 4;
    static final int MASK_OVERDUE = 8;

    /** Outer bound on overdue scan so a one-time backfill or a stuck row can't
     *  flood mailboxes weeks after the fact. */
    private static final int OVERDUE_LOOKBACK_DAYS = 14;

    private final LeaveRequestMapper leaveMapper;
    private final NotificationOrchestrator orchestrator;
    private final WeatherClient weatherClient;
    private final ObjectMapper objectMapper;

    public int scanCurrentTenant() {
        OffsetDateTime now = OffsetDateTime.now();
        return scanStart(now)
                + scanPreEnd(now)
                + scanDue(now)
                + scanOverdue(now);
    }

    private int scanStart(OffsetDateTime now) {
        OffsetDateTime in2h = now.plusHours(2);
        List<LeaveRequest> rows = leaveMapper.selectList(
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, "approved")
                        .between(LeaveRequest::getStartTime, now, in2h)
                        .apply("(reminder_sent_mask & {0}) = 0", MASK_START));
        for (LeaveRequest leave : rows) {
            tryFire(leave, MASK_START, "start", () -> sendStartReminder(leave, now));
        }
        return rows.size();
    }

    private int scanPreEnd(OffsetDateTime now) {
        OffsetDateTime in2h = now.plusHours(2);
        List<LeaveRequest> rows = leaveMapper.selectList(
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, "approved")
                        .between(LeaveRequest::getEndTime, now, in2h)
                        .apply("(reminder_sent_mask & {0}) = 0", MASK_PRE_END));
        for (LeaveRequest leave : rows) {
            tryFire(leave, MASK_PRE_END, "pre_end", () -> sendPreEndReminder(leave, now));
        }
        return rows.size();
    }

    private int scanDue(OffsetDateTime now) {
        OffsetDateTime past2h = now.minusHours(2);
        List<LeaveRequest> rows = leaveMapper.selectList(
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, "approved")
                        .between(LeaveRequest::getEndTime, past2h, now)
                        .apply("(reminder_sent_mask & {0}) = 0", MASK_DUE));
        for (LeaveRequest leave : rows) {
            tryFire(leave, MASK_DUE, "due", () -> sendDueReminder(leave));
        }
        return rows.size();
    }

    private int scanOverdue(OffsetDateTime now) {
        OffsetDateTime past2h = now.minusHours(2);
        OffsetDateTime lookback = now.minusDays(OVERDUE_LOOKBACK_DAYS);
        List<LeaveRequest> rows = leaveMapper.selectList(
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, "approved")
                        .between(LeaveRequest::getEndTime, lookback, past2h)
                        .apply("(reminder_sent_mask & {0}) = 0", MASK_OVERDUE));
        for (LeaveRequest leave : rows) {
            tryFire(leave, MASK_OVERDUE, "overdue", () -> sendOverdueReminder(leave, now));
        }
        return rows.size();
    }

    private void tryFire(LeaveRequest leave, int bit, String label, Runnable send) {
        try {
            send.run();
            markBit(leave.getId(), bit);
        } catch (Exception e) {
            // Don't mark the bit on failure — next scan will retry.
            log.warn("{} reminder failed leave={}: {}", label, leave.getId(), e.getMessage());
        }
    }

    private void sendStartReminder(LeaveRequest leave, OffsetDateTime now) {
        if (leave.getStudentId() == null || leave.getStartTime() == null) return;
        long hoursLeft = Math.max(1, ChronoUnit.HOURS.between(now, leave.getStartTime()));
        // 可选:异地行程拼接天气段。weather_seg 是带前导空格的成段文本,空时模板里直接拼空。
        String destination = extractDestination(leave);
        String weather = destination == null ? null : weatherClient.fetchSummary(destination);
        Map<String, Object> vars = baseVars(leave);
        vars.put("hours_left", hoursLeft);
        vars.put("caring", caringFor(leave.getLeaveTypeCode()));
        vars.put("weather_seg", (weather != null && !weather.isBlank()) ? " " + weather : "");
        orchestrator.send("REMINDER_LEAVE_START", "leave", leave.getId(),
                RecipientContext.applicant(leave.getStudentId()), vars);
    }

    /** Pulls the user-supplied 离校去向 from the leave's JSONB form_data. */
    private String extractDestination(LeaveRequest leave) {
        String formData = leave.getFormData();
        if (formData == null || formData.isBlank()) return null;
        try {
            Map<String, Object> form = objectMapper.readValue(formData, new TypeReference<>() {});
            Object dest = form.get("destination");
            return dest == null ? null : dest.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void sendPreEndReminder(LeaveRequest leave, OffsetDateTime now) {
        if (leave.getStudentId() == null || leave.getEndTime() == null) return;
        long hoursLeft = Math.max(1, ChronoUnit.HOURS.between(now, leave.getEndTime()));
        Map<String, Object> vars = baseVars(leave);
        vars.put("hours_left", hoursLeft);
        vars.put("end_dt", formatDateTime(leave.getEndTime()));
        orchestrator.send("REMINDER_PRE_END", "leave", leave.getId(),
                RecipientContext.applicant(leave.getStudentId()), vars);
    }

    private void sendDueReminder(LeaveRequest leave) {
        if (leave.getStudentId() == null) return;
        orchestrator.send("REMINDER_DUE", "leave", leave.getId(),
                RecipientContext.applicant(leave.getStudentId()), baseVars(leave));
    }

    private void sendOverdueReminder(LeaveRequest leave, OffsetDateTime now) {
        if (leave.getStudentId() == null || leave.getEndTime() == null) return;
        long hoursOver = Math.max(2, ChronoUnit.HOURS.between(leave.getEndTime(), now));
        // 一次 send 覆盖学生 + 辅导员抄送 — 模板的 recipients 配置 [applicant,
        // applicant_counselor cc:true],RecipientResolver 自动解析,不再需要业务侧
        // 区分两次硬编码。学生姓名让 OVERDUE 模板能在抄送给辅导员时正确显示。
        Map<String, Object> vars = baseVars(leave);
        vars.put("hours_over", hoursOver);
        vars.put("student_name", leave.getStudentName() != null
                ? leave.getStudentName() : ("学生 #" + leave.getStudentId()));
        orchestrator.send("REMINDER_OVERDUE", "leave", leave.getId(),
                RecipientContext.applicant(leave.getStudentId()), vars);
    }

    /** 5 个 reminder 共用的基础 vars(leave_type_name / range / days / start_date / end_date)。 */
    private Map<String, Object> baseVars(LeaveRequest leave) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("leave_type_name", leaveTypeLabel(leave));
        vars.put("range", formatRange(leave));
        vars.put("days", formatDays(leave.getDurationDays()));
        if (leave.getStartTime() != null) vars.put("start_date", leave.getStartTime().format(DateTimeFormatter.ofPattern("MM-dd")));
        if (leave.getEndTime() != null) vars.put("end_date", leave.getEndTime().format(DateTimeFormatter.ofPattern("MM-dd")));
        return vars;
    }

    private void markBit(Long leaveId, int bit) {
        LambdaUpdateWrapper<LeaveRequest> w = new LambdaUpdateWrapper<>();
        w.eq(LeaveRequest::getId, leaveId);
        w.setSql("reminder_sent_mask = reminder_sent_mask | " + bit);
        leaveMapper.update(null, w);
    }

    /**
     * Pure-template caring sentence keyed off leave_type_code. Zero-token by
     * design (per project decision: AI rewrite stays behind an opt-in switch
     * that this code does not yet honor — Step 3+).
     */
    private String caringFor(String code) {
        if (code == null) return "祝您一切顺利。";
        if (code.startsWith("sick")) return "请按时复诊，注意休息，祝早日康复。";
        return switch (code) {
            case "personal" -> "请妥善安排好行程。";
            case "weekend" -> "周末愉快，注意往返安全。";
            case "official" -> "活动顺利。";
            default -> "祝您一切顺利。";
        };
    }

    private String leaveTypeLabel(LeaveRequest leave) {
        return leave.getLeaveTypeName() != null ? leave.getLeaveTypeName() : "请假";
    }

    private String formatRange(LeaveRequest leave) {
        if (leave.getStartTime() == null || leave.getEndTime() == null) return "本次请假";
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("MM-dd");
        return leave.getStartTime().format(fmt) + " 至 " + leave.getEndTime().format(fmt);
    }

    private String formatDateTime(OffsetDateTime t) {
        return t.format(DateTimeFormatter.ofPattern("MM-dd HH:mm"));
    }

    private String formatDays(BigDecimal d) {
        return d == null ? "?" : d.stripTrailingZeros().toPlainString();
    }
}
