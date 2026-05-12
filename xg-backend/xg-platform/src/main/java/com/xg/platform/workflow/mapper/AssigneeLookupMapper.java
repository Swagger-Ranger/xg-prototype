package com.xg.platform.workflow.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AssigneeLookupMapper {

    /**
     * 学生的"管事辅导员"——审批 / 通知 / 工作流任务都走它。双轨语义:
     * <ul>
     *   <li>学生进了书院班(residential class)  → 取书院班导师(完全接管,学院辅导员退场)</li>
     *   <li>没进书院班                          → fallback 走学院班(原 V094 之前的逻辑)</li>
     * </ul>
     *
     * <p>CTE r 是 residential 那条;主查询 UNION ALL 包 academic 那条,
     * 用 NOT EXISTS(SELECT 1 FROM r) 实现"书院有人就不查学院",
     * 不是空集判断 = 学生没进书院班才回退。这条 SQL 是<b>整套双轨制的</b>
     * 单点入口 —— BuiltinAssigneeStrategy / ApplicantCounselorResolver 都靠它。
     */
    @Select("""
            WITH r AS (
                SELECT DISTINCT com.counselor_id
                  FROM student_org_membership sm
                  JOIN org_unit ou ON ou.id = sm.org_unit_id
                                  AND ou.track = 'residential'
                                  AND ou.type = 'dorm_block'
                                  AND ou.deleted_at IS NULL
                  JOIN counselor_org_mapping com ON com.org_id = sm.org_unit_id
                  JOIN sys_user u ON u.id = com.counselor_id
                                  AND u.status = 'active' AND u.deleted_at IS NULL
                 WHERE sm.student_user_id = #{studentUserId}
            )
            SELECT counselor_id FROM r
            UNION ALL
            SELECT DISTINCT com.counselor_id
              FROM student_profile sp
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
              JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id
              JOIN sys_user u ON u.id = com.counselor_id
                              AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM r)
             ORDER BY 1
            """)
    List<Long> findCounselorsOfStudent(@Param("studentUserId") Long studentUserId);

    /**
     * Dean(s) of the college that owns the student's class.
     * student_profile → class → org_closure → root org (college) → sys_user_role(role_id=4, org_id=college).
     */
    @Select("""
            SELECT DISTINCT ur.user_id
              FROM student_profile sp
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
              JOIN org_unit ou ON ou.id = oc.ancestor_id AND ou.type = 'college'
              JOIN sys_user_role ur ON ur.org_id = ou.id AND ur.role_id = 4
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
            """)
    List<Long> findDeansOfStudent(@Param("studentUserId") Long studentUserId);

    /**
     * All active student_affairs_officer (role_id=5) users in the tenant.
     * Scope is school-wide, so org_id on sys_user_role is ignored.
     */
    @Select("""
            SELECT DISTINCT ur.user_id
              FROM sys_user_role ur
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE ur.role_id = 5
             ORDER BY ur.user_id
            """)
    List<Long> findStudentAffairsOfficers();

    /**
     * Class master (班主任) of the student's class — taken directly from
     * {@code org_unit.leader_id} on the class node. Returns 0 or 1 user.
     * Different from {@link #findCounselorsOfStudent} which uses
     * {@code counselor_org_mapping} (one counselor manages many classes).
     */
    @Select("""
            SELECT u.id
              FROM student_profile sp
              JOIN org_unit ou ON ou.id = sp.class_id AND ou.type = 'class'
              JOIN sys_user u ON u.id = ou.leader_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
               AND ou.leader_id IS NOT NULL
            """)
    List<Long> findClassMasterOfStudent(@Param("studentUserId") Long studentUserId);

    /**
     * Holders of a class-scoped role for the student's class — looks up
     * {@code sys_user_role.org_id == class_id} by {@code sys_role.code}.
     * Used for roles where each class can have multiple holders (e.g. 班长 /
     * 团支书). Different from {@link #findClassMasterOfStudent} which uses the
     * unique {@code org_unit.leader_id} slot.
     */
    @Select("""
            SELECT DISTINCT ur.user_id
              FROM student_profile sp
              JOIN sys_user_role ur ON ur.org_id = sp.class_id
              JOIN sys_role r ON r.id = ur.role_id AND r.code = #{roleCode}
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
            """)
    List<Long> findClassRoleHoldersOfStudent(@Param("roleCode") String roleCode,
                                             @Param("studentUserId") Long studentUserId);

    /**
     * Holders of a college-scoped role for the student's college. Generic
     * version of {@link #findDeansOfStudent} — looks up by {@code sys_role.code}
     * rather than hardcoded role_id, so new college-level roles (currently
     * {@code college_secretary}) can be wired without further mapper changes.
     */
    @Select("""
            SELECT DISTINCT ur.user_id
              FROM student_profile sp
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
              JOIN org_unit ou ON ou.id = oc.ancestor_id AND ou.type = 'college'
              JOIN sys_user_role ur ON ur.org_id = ou.id
              JOIN sys_role r ON r.id = ur.role_id AND r.code = #{roleCode}
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE sp.user_id = #{studentUserId}
               AND sp.deleted_at IS NULL
            """)
    List<Long> findCollegeRoleHoldersOfStudent(@Param("roleCode") String roleCode,
                                               @Param("studentUserId") Long studentUserId);

    /**
     * All active users tenant-wide whose sys_role.code matches {@code roleCode}.
     * Used by {@link com.xg.platform.workflow.engine.GlobalRoleStrategy} so new
     * roles declared in sys_role can be wired into workflows via {@code scope=global}
     * without Java changes.
     */
    @Select("""
            SELECT DISTINCT ur.user_id
              FROM sys_user_role ur
              JOIN sys_role r ON r.id = ur.role_id AND r.code = #{roleCode}
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             ORDER BY ur.user_id
            """)
    List<Long> findUsersByRoleCode(@Param("roleCode") String roleCode);

    /**
     * All {@code sys_role.code} values the user currently holds. Used by
     * {@link com.xg.platform.workflow.engine.WorkflowEngine} to enforce
     * DSL-declared initiator roles at workflow start.
     */
    @Select("""
            SELECT DISTINCT r.code
              FROM sys_user_role ur
              JOIN sys_role r ON r.id = ur.role_id
             WHERE ur.user_id = #{userId}
            """)
    List<String> findRoleCodesByUserId(@Param("userId") Long userId);
}
