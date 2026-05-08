package com.xg.business.leave.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Looks up a student's college {@code org_unit.id} for use as
 * {@code studentOrgId} in {@link com.xg.business.leave.service.PatchMerger}'s
 * org-scope match. Walks {@code student_profile.class_id → org_closure →
 * org_unit (type='college')} — the same chain {@code AssigneeLookupMapper}
 * uses for {@code same_college} scope.
 *
 * <p>Kept narrow / single-purpose rather than fattened onto AssigneeLookupMapper,
 * since this returns an org id (not an assignee user id list) and the consumer
 * is leave-specific. Other modules that grow the same need should either reuse
 * this mapper or add their own — generalising now is premature.
 */
@Mapper
public interface StudentCollegeLookupMapper {

    /**
     * Returns the student's college org_unit.id, or {@code null} if the student
     * has no class binding (likely a misconfigured profile — caller should
     * treat as "no org-scoped patch applies", which keeps behaviour safe).
     */
    @Select("""
            SELECT ou.id
              FROM student_profile sp
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
              JOIN org_unit ou ON ou.id = oc.ancestor_id AND ou.type = 'college'
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
             LIMIT 1
            """)
    Long findCollegeIdOfStudent(@Param("studentUserId") Long studentUserId);

    /**
     * Returns the student's {@code education_level} (e.g. {@code 本科} /
     * {@code 硕士} / {@code 博士}) — the dimension OrgPatch can scope to via
     * {@code scope.studentTypes}. Returns {@code null} when the profile is
     * missing; PatchMerger then treats {@code studentTypes}-scoped patches as
     * non-matching, which is the safe default.
     */
    @Select("""
            SELECT education_level
              FROM student_profile
             WHERE user_id = #{studentUserId}
               AND deleted_at IS NULL
             LIMIT 1
            """)
    String findEducationLevelOfStudent(@Param("studentUserId") Long studentUserId);
}
