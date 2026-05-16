package com.xg.platform.care.domain;

import com.xg.common.exception.BizException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static com.xg.platform.care.domain.CareTaskEvent.*;
import static com.xg.platform.care.domain.CareTaskStatus.*;

/**
 * 纯单测：状态机常量表必须逐条对齐 docs/W1-信息架构与任务卡.md §5.2。
 * 这层错了，整个任务生命周期都会错，且没有 DB 可兜底，所以全路径枚举覆盖。
 */
class CareTaskTransitionsTest {

    @Test
    void pending_transitions() {
        assertThat(CareTaskTransitions.next(PENDING, ACCEPT)).isEqualTo(ACCEPTED);
        assertThat(CareTaskTransitions.next(PENDING, REJECT)).isEqualTo(REJECTED);
        assertThat(CareTaskTransitions.next(PENDING, TRANSFER)).isEqualTo(TRANSFERRED);
        assertThat(CareTaskTransitions.next(PENDING, RESCHEDULE)).isEqualTo(PENDING);
        assertThat(CareTaskTransitions.next(PENDING, OVERDUE_TICK)).isEqualTo(OVERDUE);
    }

    @Test
    void accepted_transitions() {
        assertThat(CareTaskTransitions.next(ACCEPTED, SAVE_FOLLOWUP)).isEqualTo(IN_PROGRESS);
        assertThat(CareTaskTransitions.next(ACCEPTED, RESOLVE)).isEqualTo(RESOLVED);
        assertThat(CareTaskTransitions.next(ACCEPTED, REJECT)).isEqualTo(REJECTED);
        assertThat(CareTaskTransitions.next(ACCEPTED, TRANSFER)).isEqualTo(TRANSFERRED);
        assertThat(CareTaskTransitions.next(ACCEPTED, RESCHEDULE)).isEqualTo(PENDING);
        assertThat(CareTaskTransitions.next(ACCEPTED, OVERDUE_TICK)).isEqualTo(OVERDUE);
    }

    @Test
    void in_progress_transitions() {
        assertThat(CareTaskTransitions.next(IN_PROGRESS, RESOLVE)).isEqualTo(RESOLVED);
        assertThat(CareTaskTransitions.next(IN_PROGRESS, TRANSFER)).isEqualTo(TRANSFERRED);
    }

    @Test
    void overdue_transitions() {
        assertThat(CareTaskTransitions.next(OVERDUE, ACCEPT)).isEqualTo(ACCEPTED);
        assertThat(CareTaskTransitions.next(OVERDUE, RESOLVE)).isEqualTo(RESOLVED);
        assertThat(CareTaskTransitions.next(OVERDUE, TRANSFER)).isEqualTo(TRANSFERRED);
    }

    @Test
    void terminal_states_have_no_outgoing_transitions() {
        for (CareTaskEvent e : CareTaskEvent.values()) {
            assertThat(CareTaskTransitions.isAllowed(RESOLVED, e)).as("resolved+" + e).isFalse();
            assertThat(CareTaskTransitions.isAllowed(REJECTED, e)).as("rejected+" + e).isFalse();
            assertThat(CareTaskTransitions.isAllowed(TRANSFERRED, e)).as("transferred+" + e).isFalse();
        }
    }

    @Test
    void illegal_transition_throws_invalid_transition_bizexception() {
        // in_progress 不能直接接单 / pending 不能 save_followup / overdue 不能 reject
        assertThatThrownBy(() -> CareTaskTransitions.next(IN_PROGRESS, ACCEPT))
                .isInstanceOf(BizException.class)
                .extracting("code").isEqualTo("CARE_TASK_INVALID_TRANSITION");
        assertThatThrownBy(() -> CareTaskTransitions.next(PENDING, SAVE_FOLLOWUP))
                .isInstanceOf(BizException.class)
                .extracting("code").isEqualTo("CARE_TASK_INVALID_TRANSITION");
        assertThatThrownBy(() -> CareTaskTransitions.next(OVERDUE, REJECT))
                .isInstanceOf(BizException.class)
                .extracting("code").isEqualTo("CARE_TASK_INVALID_TRANSITION");
        assertThatThrownBy(() -> CareTaskTransitions.next(RESOLVED, ACCEPT))
                .isInstanceOf(BizException.class)
                .extracting("code").isEqualTo("CARE_TASK_INVALID_TRANSITION");
    }

    @Test
    void isAllowed_matches_next_without_throwing() {
        assertThat(CareTaskTransitions.isAllowed(PENDING, ACCEPT)).isTrue();
        assertThat(CareTaskTransitions.isAllowed(IN_PROGRESS, ACCEPT)).isFalse();
    }

    @Test
    void status_terminal_flags() {
        assertThat(RESOLVED.isTerminal()).isTrue();
        assertThat(REJECTED.isTerminal()).isTrue();
        assertThat(TRANSFERRED.isTerminal()).isTrue();
        assertThat(PENDING.isTerminal()).isFalse();
        assertThat(OVERDUE.isTerminal()).as("overdue 不是终态，仍需处理").isFalse();
    }

    @Test
    void status_fromCode_roundtrip() {
        for (CareTaskStatus s : CareTaskStatus.values()) {
            assertThat(CareTaskStatus.fromCode(s.getCode())).contains(s);
        }
        assertThat(CareTaskStatus.fromCode("nope")).isEmpty();
        assertThat(CareTaskStatus.fromCode(null)).isEmpty();
    }
}
