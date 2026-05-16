package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯单测：规则效果报表治理提示阈值（PRD §14.1）。 */
class CareEffectGovernanceTest {

    @Test
    void no_hints_when_no_triggers() {
        assertThat(CareEffectGovernance.hints(0, 0, 0, 0, 0)).isEmpty();
    }

    @Test
    void false_positive_over_20pct_hints_review() {
        // 10 触发 / 3 误报 = 30% > 20%
        List<String> hints = CareEffectGovernance.hints(10, 3, 0, 10, 5);
        assertThat(hints).anyMatch(h -> h.contains("误报"));
    }

    @Test
    void at_exactly_20pct_no_hint() {
        // 10 / 2 = 20%，严格大于才提示
        List<String> hints = CareEffectGovernance.hints(10, 2, 0, 10, 5);
        assertThat(hints).noneMatch(h -> h.contains("误报"));
    }

    @Test
    void handled_offline_over_30pct_hints_threshold_too_tight() {
        // 10 / 4 = 40% > 30%
        List<String> hints = CareEffectGovernance.hints(10, 0, 4, 10, 5);
        assertThat(hints).anyMatch(h -> h.contains("阈值可能偏紧"));
    }

    @Test
    void sixty_day_no_accept_hints_review() {
        List<String> hints = CareEffectGovernance.hints(0, 0, 0, 8, 0);
        assertThat(hints).anyMatch(h -> h.contains("60 天无人接单"));
    }

    @Test
    void sixty_day_with_accepts_no_stale_hint() {
        List<String> hints = CareEffectGovernance.hints(0, 0, 0, 8, 1);
        assertThat(hints).noneMatch(h -> h.contains("60 天无人接单"));
    }
}
