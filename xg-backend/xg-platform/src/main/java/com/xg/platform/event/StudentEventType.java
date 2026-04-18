package com.xg.platform.event;

public enum StudentEventType {
    LEAVE_SUBMIT("leave_submit"),
    LEAVE_REJECTED("leave_rejected"),
    LEAVE_CANCELLED("leave_cancelled"),
    CHECKIN_SUCCESS("checkin_success"),
    CHECKIN_ABSENT("checkin_absent"),
    CHECKIN_LATE("checkin_late"),
    VIOLATION_RECORDED("violation_recorded"),
    COMPLAINT_SUBMITTED("complaint_submitted"),
    NOTIFICATION_CONFIRMED("notification_confirmed"),
    NOTIFICATION_UNCONFIRMED("notification_unconfirmed"),
    COLLECTION_FILLED("collection_filled"),
    COLLECTION_OVERDUE("collection_overdue"),
    COUNSELOR_TALK_RECORDED("counselor_talk_recorded");

    private final String code;

    StudentEventType(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}
