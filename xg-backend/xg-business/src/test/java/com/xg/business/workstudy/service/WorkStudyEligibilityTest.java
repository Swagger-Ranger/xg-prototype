package com.xg.business.workstudy.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.workstudy.model.WorkStudyPosition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure-function tests for the eligibility predicate.
 *
 * <p>Constructs a {@link WorkStudyService} via reflection-free public constructor
 * — all dependencies passed as null because the methods we exercise
 * ({@code isEligible}, {@code matchesJsonStringList}) only need the ObjectMapper.
 * If those methods grow new mapper calls, this test will fail loudly with NPE
 * which is the right signal to widen the harness.</p>
 */
class WorkStudyEligibilityTest {

    private WorkStudyService service;

    @BeforeEach
    void setUp() {
        service = new WorkStudyService(
                /* positionMapper */     null,
                /* applicationMapper */  null,
                /* timesheetMapper */    null,
                /* yearSettingMapper */  null,
                /* workflowEngine */     null,
                /* workflowInstance */   null,
                /* taskInstance */       null,
                /* sysUserMapper */      null,
                /* studentProfile */     null,
                /* formDataValidator */  null,
                /* objectMapper */       new ObjectMapper(),
                /* notificationOrch */   null,
                /* employerService */    null,
                /* studentEventPub */    null);
    }

    private WorkStudyPosition pos(int headcount, int hired) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setHeadcount(headcount);
        p.setHiredCount(hired);
        return p;
    }

    private static WorkStudyService.StudentEligibility student(
            String gender, String grade, String college, String aid) {
        return new WorkStudyService.StudentEligibility(gender, grade, college, aid);
    }

    // ============================================================
    // Headcount
    // ============================================================

    @Test
    void headcountFull_isIneligible() {
        assertThat(service.isEligible(pos(2, 2), student("male", "2024", "CS", "none"))).isFalse();
    }

    @Test
    void headcountFull_atExactBoundary_isIneligible() {
        // hired == headcount → cannot accept new applicants
        WorkStudyPosition p = pos(1, 1);
        p.setGenderLimit(null);
        assertThat(service.isEligible(p, student("male", "2024", "CS", "none"))).isFalse();
    }

    @Test
    void headcountNullOrZero_doesNotBlock() {
        // Both null → unrestricted; eligible based on other dims
        WorkStudyPosition p = new WorkStudyPosition();
        assertThat(service.isEligible(p, student("male", "2024", "CS", "none"))).isTrue();
    }

    // ============================================================
    // Gender
    // ============================================================

    @Test
    void genderRestriction_caseInsensitiveMatch() {
        WorkStudyPosition p = pos(5, 0);
        p.setGenderLimit("male");
        assertThat(service.isEligible(p, student("MALE", "2024", "CS", "none"))).isTrue();
        assertThat(service.isEligible(p, student("female", "2024", "CS", "none"))).isFalse();
    }

    @Test
    void genderBlankString_treatedAsNoLimit() {
        WorkStudyPosition p = pos(5, 0);
        p.setGenderLimit("   ");
        assertThat(service.isEligible(p, student("female", "2024", "CS", "none"))).isTrue();
    }

    @Test
    void genderRestrictionWithNullStudentGender_passes() {
        // student.gender == null → guard short-circuits; we don't reject
        WorkStudyPosition p = pos(5, 0);
        p.setGenderLimit("male");
        assertThat(service.isEligible(p, student(null, "2024", "CS", "none"))).isTrue();
    }

    // ============================================================
    // Grade / College / Aid level (JSON list inclusion)
    // ============================================================

    @Test
    void gradeWhitelist_acceptsListedAndRejectsOthers() {
        WorkStudyPosition p = pos(5, 0);
        p.setGradeLimits("[\"2023\",\"2024\"]");
        assertThat(service.isEligible(p, student("male", "2024", "CS", "none"))).isTrue();
        assertThat(service.isEligible(p, student("male", "2022", "CS", "none"))).isFalse();
    }

    @Test
    void emptyJsonList_isNoRestriction() {
        WorkStudyPosition p = pos(5, 0);
        p.setGradeLimits("[]");
        p.setCollegeLimits("[]");
        p.setAidLevels("[]");
        assertThat(service.isEligible(p, student("male", "2024", "CS", "none"))).isTrue();
    }

    @Test
    void aidLevels_studentWithoutAidDefaultsToNone() {
        WorkStudyPosition p = pos(5, 0);
        p.setAidLevels("[\"none\"]");                      // 不困难学生也允许
        // student profile aid_level is null → resolver substitutes "none"
        assertThat(service.isEligible(p, student("male", "2024", "CS", null))).isTrue();
    }

    @Test
    void aidLevels_studentWithoutAid_isRejectedWhenDifficultOnly() {
        WorkStudyPosition p = pos(5, 0);
        p.setAidLevels("[\"difficult\",\"special\"]");
        assertThat(service.isEligible(p, student("male", "2024", "CS", null))).isFalse();
    }

    @Test
    void aidLevels_specialQualifies() {
        WorkStudyPosition p = pos(5, 0);
        p.setAidLevels("[\"difficult\",\"special\"]");
        assertThat(service.isEligible(p, student("male", "2024", "CS", "special"))).isTrue();
    }

    // ============================================================
    // matchesJsonStringList — direct unit tests
    // ============================================================

    @Test
    void matches_nullOrBlankOrEmpty_isAlwaysTrue() {
        assertThat(service.matchesJsonStringList(null, "x")).isTrue();
        assertThat(service.matchesJsonStringList("", "x")).isTrue();
        assertThat(service.matchesJsonStringList("[]", "x")).isTrue();
    }

    @Test
    void matches_failsOpen_onMalformedJson() {
        // Bad data should NOT hide every position — log + true
        assertThat(service.matchesJsonStringList("{not json", "x")).isTrue();
    }

    @Test
    void matches_handlesNumericListEntries() {
        // college_limits stores college IDs as numbers — String.valueOf must coerce
        assertThat(service.matchesJsonStringList("[101,102,103]", "102")).isTrue();
        assertThat(service.matchesJsonStringList("[101,102,103]", "999")).isFalse();
    }

    @Test
    void matches_nullStudentValue_withNonEmptyList_isFalse() {
        // restricted list but student field unknown → cannot be confirmed eligible
        assertThat(service.matchesJsonStringList("[\"2024\"]", null)).isFalse();
    }
}
