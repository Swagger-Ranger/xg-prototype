package com.xg.platform.alert.service;

import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Formats a single student_event_log row into a short Chinese summary line shown to counselors
 * in the alert detail drawer. Rendering is best-effort — unknown event types fall back to a
 * generic label so the caller can still present *something* without special-casing.
 */
@Component
public class EventSummaryFormatter {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    private static final Map<String, String> TYPE_LABELS = Map.ofEntries(
            Map.entry("leave_submit", "请假"),
            Map.entry("violation_recorded", "违纪"),
            Map.entry("violation_approved", "违纪审批通过"),
            Map.entry("violation_rejected", "违纪被驳回"),
            Map.entry("violation_appeal_submitted", "违纪申诉"),
            Map.entry("violation_appeal_upheld", "申诉被支持"),
            Map.entry("violation_appeal_rejected", "申诉被驳回"),
            Map.entry("checkin_late", "迟到"),
            Map.entry("checkin_absent", "缺勤"),
            Map.entry("grade_fail", "课程不及格"),
            Map.entry("dormitory_violation", "宿舍违规")
    );

    public String format(String eventType, Map<String, Object> eventData, OffsetDateTime occurredAt) {
        String date = occurredAt == null ? "" : occurredAt.format(DATE);
        String detail = formatDetail(eventType, eventData);
        String label = TYPE_LABELS.getOrDefault(eventType, eventType);
        if (detail.isEmpty()) return date + " " + label;
        return date + " " + label + "（" + detail + "）";
    }

    private String formatDetail(String eventType, Map<String, Object> data) {
        if (data == null) return "";
        return switch (eventType) {
            case "leave_submit" -> {
                Object days = data.get("duration_days");
                Object type = data.get("leave_type");
                StringBuilder sb = new StringBuilder();
                if (days != null) sb.append(days).append(" 天");
                if (type != null) {
                    if (sb.length() > 0) sb.append("，");
                    sb.append(leaveTypeLabel(type.toString()));
                }
                yield sb.toString();
            }
            case "violation_recorded" -> {
                Object vtype = data.get("violation_type");
                yield vtype == null ? "" : violationTypeLabel(vtype.toString());
            }
            case "checkin_late" -> {
                Object mins = data.get("minutes_late");
                yield mins == null ? "" : mins + " 分钟";
            }
            default -> "";
        };
    }

    private static String leaveTypeLabel(String t) {
        return switch (t) {
            case "personal" -> "事假";
            case "sick"     -> "病假";
            case "weekend"  -> "周末请假";
            case "public"   -> "公假";
            default         -> t;
        };
    }

    private static String violationTypeLabel(String t) {
        return switch (t) {
            case "attendance" -> "考勤";
            case "dormitory" -> "宿舍";
            case "academic"  -> "学业";
            case "discipline"-> "纪律";
            default          -> t;
        };
    }
}
