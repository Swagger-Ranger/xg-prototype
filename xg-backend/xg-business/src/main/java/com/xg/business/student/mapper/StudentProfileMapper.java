package com.xg.business.student.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.student.dto.ClassRosterEntry;
import com.xg.business.student.model.StudentProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface StudentProfileMapper extends BaseMapper<StudentProfile> {

    /**
     * Resolve sys_user.id of all students managed by the given counselor.
     * Traverses counselor_org_mapping → org_closure (descendant classes) → student_profile.class_id.
     * Returns an empty list when the counselor manages no org.
     */
    @Select({
            "SELECT DISTINCT sp.user_id",
            "FROM student_profile sp",
            "JOIN org_closure oc ON oc.descendant_id = sp.class_id",
            "JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id",
            "WHERE com.counselor_id = #{counselorId}",
            "  AND sp.deleted_at IS NULL"
    })
    List<Long> findStudentUserIdsByCounselor(@Param("counselorId") Long counselorId);

    /**
     * Resolve sys_user.id of all students whose class falls under any college
     * the given dean (sys_user_role role_id=4) is bound to. Mirrors
     * AssigneeLookupMapper.findDeansOfStudent in reverse direction.
     */
    @Select({
            "SELECT DISTINCT sp.user_id",
            "FROM student_profile sp",
            "JOIN org_closure oc ON oc.descendant_id = sp.class_id",
            "JOIN org_unit ou ON ou.id = oc.ancestor_id AND ou.type = 'college'",
            "JOIN sys_user_role ur ON ur.org_id = ou.id AND ur.role_id = 4",
            "WHERE ur.user_id = #{deanId}",
            "  AND sp.deleted_at IS NULL"
    })
    List<Long> findStudentUserIdsByDean(@Param("deanId") Long deanId);

    /**
     * Resolve sys_user.id of all students in the class led by the given class master.
     * Class master ↔ class is recorded via org_unit.leader_id (V085 contract:
     * 班主任唯一,挂 org_unit.leader_id;class_monitor 可多人,挂 sys_user_role.org_id).
     */
    @Select({
            "SELECT DISTINCT sp.user_id",
            "FROM student_profile sp",
            "JOIN org_unit ou ON ou.id = sp.class_id",
            "WHERE ou.leader_id = #{classMasterId}",
            "  AND sp.deleted_at IS NULL"
    })
    List<Long> findStudentUserIdsByClassMaster(@Param("classMasterId") Long classMasterId);

    /**
     * Full roster (one row per student) for the given counselor. Drives the
     * workspace's cross-class view — one source of truth so class badges on
     * leave/alert/violation rows don't each need a denormalised class_name.
     */
    @Select({
            "SELECT DISTINCT sp.user_id, sp.student_no, u.real_name AS name,",
            "       sp.class_id, sp.class_name, sp.grade, sp.status",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "JOIN org_closure oc ON oc.descendant_id = sp.class_id",
            "JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id",
            "WHERE com.counselor_id = #{counselorId}",
            "  AND sp.deleted_at IS NULL",
            "ORDER BY sp.class_name, sp.student_no"
    })
    List<ClassRosterEntry> findRosterByCounselor(@Param("counselorId") Long counselorId);

    /**
     * 当前用户的扩展信息 JSON 字符串。走 MyBatis 是因为 TenantSchemaInterceptor
     * 只拦 MyBatis Executor，JdbcTemplate 不会自动 SET search_path 到租户 schema。
     */
    @Select("SELECT extended_info::text FROM student_profile " +
            "WHERE user_id = #{userId} AND deleted_at IS NULL LIMIT 1")
    String findExtendedInfoJsonByUserId(@Param("userId") Long userId);
}
