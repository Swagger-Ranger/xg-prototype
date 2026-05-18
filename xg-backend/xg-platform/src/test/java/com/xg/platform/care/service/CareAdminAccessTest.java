package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯单测：管理视图角色判定与下钻配额分级（PRD §6.2 / §13.2）。 */
class CareAdminAccessTest {

    @Test
    void manager_roles_recognized() {
        assertThat(CareAdminAccess.isManager(List.of("dean"))).isTrue();
        assertThat(CareAdminAccess.isManager(List.of("school_admin"))).isTrue();
        assertThat(CareAdminAccess.isManager(List.of("student_affairs_director"))).isTrue();
        assertThat(CareAdminAccess.isManager(List.of("super_admin"))).isTrue();
    }

    @Test
    void non_manager_roles_rejected() {
        assertThat(CareAdminAccess.isManager(List.of("counselor"))).isFalse();
        assertThat(CareAdminAccess.isManager(List.of("student"))).isFalse();
        assertThat(CareAdminAccess.isManager(List.of())).isFalse();
    }

    @Test
    void drill_quota_tiers() {
        assertThat(CareAdminAccess.drillDailyLimit(List.of("dean"))).isEqualTo(20);
        assertThat(CareAdminAccess.drillDailyLimit(List.of("school_admin"))).isEqualTo(50);
        assertThat(CareAdminAccess.drillDailyLimit(List.of("student_affairs_director")))
                .isEqualTo(CareAdminAccess.DRILL_UNLIMITED);
        assertThat(CareAdminAccess.drillDailyLimit(List.of("super_admin")))
                .isEqualTo(CareAdminAccess.DRILL_UNLIMITED);
        assertThat(CareAdminAccess.drillDailyLimit(List.of("counselor"))).isEqualTo(0);
    }

    @Test
    void multi_role_takes_highest_quota() {
        assertThat(CareAdminAccess.drillDailyLimit(List.of("dean", "school_admin")))
                .isEqualTo(50);
        assertThat(CareAdminAccess.drillDailyLimit(List.of("school_admin", "super_admin")))
                .isEqualTo(CareAdminAccess.DRILL_UNLIMITED);
    }

    @Test
    void actor_role_precedence_for_audit() {
        assertThat(CareAdminAccess.actorRole(List.of("dean", "super_admin")))
                .isEqualTo("super_admin");
        assertThat(CareAdminAccess.actorRole(List.of("dean", "school_admin")))
                .isEqualTo("school_admin");
        assertThat(CareAdminAccess.actorRole(List.of("counselor"))).isEqualTo("counselor");
        assertThat(CareAdminAccess.actorRole(List.of())).isEqualTo("unknown");
    }
}
