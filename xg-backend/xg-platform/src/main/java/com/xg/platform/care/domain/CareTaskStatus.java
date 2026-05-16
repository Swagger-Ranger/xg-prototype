package com.xg.platform.care.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Optional;

/**
 * 关怀任务状态。
 * 终态：RESOLVED / REJECTED / TRANSFERRED（不可逆）。
 * OVERDUE 不是终态，仍需处理。
 */
@Getter
@RequiredArgsConstructor
public enum CareTaskStatus {

    PENDING("pending"),
    ACCEPTED("accepted"),
    IN_PROGRESS("in_progress"),
    RESOLVED("resolved"),
    REJECTED("rejected"),
    TRANSFERRED("transferred"),
    OVERDUE("overdue");

    private final String code;

    public boolean isTerminal() {
        return this == RESOLVED || this == REJECTED || this == TRANSFERRED;
    }

    public static Optional<CareTaskStatus> fromCode(String code) {
        if (code == null) return Optional.empty();
        for (CareTaskStatus s : values()) {
            if (s.code.equals(code)) return Optional.of(s);
        }
        return Optional.empty();
    }
}
