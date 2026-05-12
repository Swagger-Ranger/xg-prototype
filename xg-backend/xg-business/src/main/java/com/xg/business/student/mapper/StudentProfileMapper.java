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
     * 辅导员"管事范围"内的学生(请假待审列表用)。双轨语义反向:
     * <ul>
     *   <li>residential path: 辅导员挂的 dorm_block 下的学生(走 membership)</li>
     *   <li>academic path: 辅导员挂的学院树下的学生,**排除已被书院接管**的
     *       (NOT EXISTS 子查询:该学生有 residential class membership 且对应班绑了导师)</li>
     * </ul>
     *
     * <p>排除子句必须跟 {@code AssigneeLookupMapper.findCounselorsOfStudent} 的"先 residential 后 fallback"
     * 一致 —— 学生被书院接管 ↔ 学院辅导员视野里消失 ↔ 学院辅导员审批列表里没他。
     */
    @Select({
            "SELECT DISTINCT sm.student_user_id AS user_id",
            "FROM student_org_membership sm",
            "JOIN org_unit ou ON ou.id = sm.org_unit_id",
            "  AND ou.track = 'residential' AND ou.type = 'dorm_block' AND ou.deleted_at IS NULL",
            "JOIN counselor_org_mapping com ON com.org_id = sm.org_unit_id",
            "WHERE com.counselor_id = #{counselorId}",
            "UNION",
            "SELECT DISTINCT sp.user_id",
            "FROM student_profile sp",
            "JOIN org_closure oc ON oc.descendant_id = sp.class_id",
            "JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id",
            "WHERE com.counselor_id = #{counselorId}",
            "  AND sp.deleted_at IS NULL",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM student_org_membership sm2",
            "    JOIN org_unit ou2 ON ou2.id = sm2.org_unit_id",
            "      AND ou2.track = 'residential' AND ou2.type = 'dorm_block'",
            "      AND ou2.deleted_at IS NULL",
            "    JOIN counselor_org_mapping com2 ON com2.org_id = sm2.org_unit_id",
            "    WHERE sm2.student_user_id = sp.user_id",
            "  )"
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
     * 辅导员的"班级花名册"(workspace 视图)。双轨语义:union 两条路径,**不**排除已被接管的学生 ——
     * 跟 findStudentUserIdsByCounselor 不同,花名册是"管理范围"视图,学院辅导员仍能看到本班学生
     * 即使他已被书院班接管(只是请假审批列表里看不到)。
     *
     * <p>明德导师挂明德 1/2 班 → 花名册显示跨学院的学生(张晓明/周佳怡/郑雅琴...);
     * 李老师挂软件 2301 → 花名册仍显示该班全部学生,含已进书院的张晓明。
     */
    @Select({
            "SELECT DISTINCT sp.user_id, sp.student_no, u.real_name AS name,",
            "       sp.class_id, sp.class_name, sp.grade, sp.status",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.deleted_at IS NULL",
            "  AND sp.user_id IN (",
            "    SELECT DISTINCT sm.student_user_id",
            "    FROM student_org_membership sm",
            "    JOIN org_unit ou ON ou.id = sm.org_unit_id",
            "      AND ou.track = 'residential' AND ou.type = 'dorm_block'",
            "      AND ou.deleted_at IS NULL",
            "    JOIN counselor_org_mapping com ON com.org_id = sm.org_unit_id",
            "    WHERE com.counselor_id = #{counselorId}",
            "    UNION",
            "    SELECT DISTINCT sp2.user_id",
            "    FROM student_profile sp2",
            "    JOIN org_closure oc ON oc.descendant_id = sp2.class_id",
            "    JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id",
            "    WHERE com.counselor_id = #{counselorId}",
            "      AND sp2.deleted_at IS NULL",
            "  )",
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
