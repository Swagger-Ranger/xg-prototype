package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯单测：全局严重度偏移钳位（PRD §6.3，序 low<medium<high<critical）。 */
class CareSeverityTest {

    @Test
    void zero_offset_is_identity() {
        assertThat(CareSeverity.applyOffset("high", 0)).isEqualTo("high");
        assertThat(CareSeverity.applyOffset("low", 0)).isEqualTo("low");
    }

    @Test
    void plus_one_shifts_up() {
        assertThat(CareSeverity.applyOffset("low", 1)).isEqualTo("medium");
        assertThat(CareSeverity.applyOffset("high", 1)).isEqualTo("critical");
    }

    @Test
    void minus_one_shifts_down() {
        assertThat(CareSeverity.applyOffset("critical", -1)).isEqualTo("high");
        assertThat(CareSeverity.applyOffset("medium", -1)).isEqualTo("low");
    }

    @Test
    void clamps_at_both_ends() {
        assertThat(CareSeverity.applyOffset("critical", 1)).isEqualTo("critical");
        assertThat(CareSeverity.applyOffset("low", -1)).isEqualTo("low");
    }

    @Test
    void unknown_severity_returned_unchanged() {
        assertThat(CareSeverity.applyOffset("weird", 1)).isEqualTo("weird");
        assertThat(CareSeverity.applyOffset(null, -1)).isNull();
    }
}
