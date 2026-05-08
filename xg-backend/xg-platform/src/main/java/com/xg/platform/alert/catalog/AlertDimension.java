package com.xg.platform.alert.catalog;

import com.xg.platform.event.StudentEventType;

import java.util.EnumSet;
import java.util.Set;

public enum AlertDimension {
    LEAVE("leave", EnumSet.of(StudentEventType.LEAVE_SUBMIT, StudentEventType.LEAVE_CANCELLED)),
    CHECKIN_LATE("checkin_late", EnumSet.of(StudentEventType.CHECKIN_LATE)),
    ABSENCE("absence", EnumSet.of(StudentEventType.CHECKIN_ABSENT, StudentEventType.ABSENCE_RECORDED)),
    VIOLATION("violation", EnumSet.of(StudentEventType.VIOLATION_RECORDED)),
    DORM_CHECK("dorm_check", EnumSet.of(StudentEventType.DORM_CHECK_ABSENT, StudentEventType.DORM_CHECK_PASSED)),
    AI_CHAT("ai_chat", EnumSet.of(StudentEventType.AI_CHAT_SENSITIVE, StudentEventType.AI_CHAT_NORMAL)),
    CONSUMPTION("consumption", EnumSet.of(StudentEventType.CONSUMPTION_RECORDED, StudentEventType.CONSUMPTION_ANOMALY)),
    EXAM_FAIL("exam_fail", EnumSet.of(StudentEventType.EXAM_FAILED));

    private final String code;
    private final Set<StudentEventType> eventTypes;

    AlertDimension(String code, Set<StudentEventType> eventTypes) {
        this.code = code;
        this.eventTypes = eventTypes;
    }

    public String code() {
        return code;
    }

    public Set<StudentEventType> eventTypes() {
        return eventTypes;
    }

    public static AlertDimension fromCode(String code) {
        for (AlertDimension d : values()) {
            if (d.code.equals(code)) return d;
        }
        throw new IllegalArgumentException("Unknown dimension: " + code);
    }
}
