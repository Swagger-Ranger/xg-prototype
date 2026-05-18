package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 纯单测：on-create 通知模板路由（PRD §12.3）。
 * high/critical 即时发，medium（走日聚合）/ low（站内待办即任务）不即时发。
 */
class CareNotifyPolicyTest {

    @Test
    void high_maps_to_immediate() {
        assertThat(CareNotifyPolicy.codeForCreate("high"))
                .contains(CareNotifyPolicy.HIGH_IMMEDIATE);
    }

    @Test
    void critical_maps_to_dashboard() {
        assertThat(CareNotifyPolicy.codeForCreate("critical"))
                .contains(CareNotifyPolicy.CRITICAL_DASHBOARD);
    }

    @Test
    void medium_and_low_no_immediate_send() {
        assertThat(CareNotifyPolicy.codeForCreate("medium")).isEmpty();
        assertThat(CareNotifyPolicy.codeForCreate("low")).isEmpty();
    }

    @Test
    void unknown_or_null_severity_no_send() {
        assertThat(CareNotifyPolicy.codeForCreate("weird")).isEmpty();
        assertThat(CareNotifyPolicy.codeForCreate(null)).isEqualTo(Optional.empty());
    }
}
