package com.xg.platform.event;

public enum StudentEventType {
    LEAVE_SUBMIT("leave_submit", 2),
    LEAVE_REJECTED("leave_rejected", 4),
    LEAVE_CANCELLED("leave_cancelled", 2),
    CHECKIN_SUCCESS("checkin_success", 0),
    CHECKIN_ABSENT("checkin_absent", 6),
    CHECKIN_LATE("checkin_late", 4),
    VIOLATION_RECORDED("violation_recorded", 7),
    VIOLATION_APPROVED("violation_approved", 7),
    VIOLATION_REJECTED("violation_rejected", 0),
    VIOLATION_APPEAL_SUBMITTED("violation_appeal_submitted", 2),
    VIOLATION_APPEAL_UPHELD("violation_appeal_upheld", 0),
    VIOLATION_APPEAL_REJECTED("violation_appeal_rejected", 3),
    NOTIFICATION_CONFIRMED("notification_confirmed", 0),
    NOTIFICATION_UNCONFIRMED("notification_unconfirmed", 3),
    COLLECTION_FILLED("collection_filled", 0),
    COLLECTION_OVERDUE("collection_overdue", 3),
    COUNSELOR_TALK_RECORDED("counselor_talk_recorded", 1),

    DORM_CHECK_ABSENT("dorm_check_absent", 5),
    DORM_CHECK_PASSED("dorm_check_passed", 0),
    AI_CHAT_SENSITIVE("ai_chat_sensitive", 4),
    AI_CHAT_NORMAL("ai_chat_normal", 0),
    ABSENCE_RECORDED("absence_recorded", 6),
    EXAM_FAILED("exam_failed", 5),
    CONSUMPTION_RECORDED("consumption_recorded", 0),
    CONSUMPTION_ANOMALY("consumption_anomaly", 4);

    private final String code;
    private final int defaultSeverity;

    StudentEventType(String code, int defaultSeverity) {
        this.code = code;
        this.defaultSeverity = defaultSeverity;
    }

    public String code() {
        return code;
    }

    public int defaultSeverity() {
        return defaultSeverity;
    }
}
