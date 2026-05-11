package com.xg.business.student.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.dto.StudentView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * Custom SQL mapper for joined sys_user + student_profile views.
 * Tenant isolation is handled by TenantSchemaInterceptor (SET search_path per request).
 * Snake-case columns are mapped to camelCase fields via map-underscore-to-camel-case.
 */
@Mapper
public interface StudentViewMapper {

    /**
     * 学生分页查询。WHERE 子句由 SqlBuilder 从字段目录拼出来,以 ${dynamicWhere}
     * 文本插入 (内部只含校验过的标识符和 #{} 占位符,无注入面)。filter 的实际值
     * 走 #{filters.xxx} 安全绑定。新增可筛字段 = 改 yaml,这里不动。
     */
    @Select({
            "<script>",
            "SELECT sp.id, sp.user_id, sp.student_no,",
            "       u.real_name AS name, u.gender, sp.grade, sp.college, sp.major,",
            "       sp.class_name, u.phone, u.email, sp.status,",
            "       sp.education_level, sp.enrollment_date, sp.created_at,",
            "       sp.extended_info::text AS extended_info,",
            // 生活线归属:走 membership ⨯ org_unit 子查询,各取一行 (一个学生通常只属于
            // 一个书院 + 一个楼栋)。无书院的学校这两个 subquery 永远返回 NULL,VO 字段
            // 缺省 null,前端见 null 不渲染列。
            "       (SELECT ou.name FROM student_org_membership sm",
            "         JOIN org_unit ou ON ou.id = sm.org_unit_id",
            "         WHERE sm.student_user_id = sp.user_id AND ou.deleted_at IS NULL",
            "           AND ou.track = 'residential' AND ou.type = 'academy' LIMIT 1) AS residential_academy,",
            "       (SELECT ou.name FROM student_org_membership sm",
            "         JOIN org_unit ou ON ou.id = sm.org_unit_id",
            "         WHERE sm.student_user_id = sp.user_id AND ou.deleted_at IS NULL",
            "           AND ou.track = 'residential' AND ou.type = 'dorm_block' LIMIT 1) AS residential_dorm_block",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.deleted_at IS NULL",
            "${dynamicWhere}",
            "ORDER BY sp.created_at DESC",
            "</script>"
    })
    IPage<StudentView> selectStudentPage(
            Page<StudentView> page,
            @Param("dynamicWhere") String dynamicWhere,
            @Param("filters") Map<String, Object> filters
    );

    /**
     * Distinct class names visible under an optional college / major filter,
     * for the cascading 班级 filter on the student-info page. Null params skip
     * that condition. Empty string also skips.
     */
    @Select({
            "<script>",
            "SELECT DISTINCT sp.class_name",
            "FROM student_profile sp",
            "WHERE sp.deleted_at IS NULL AND sp.class_name IS NOT NULL AND sp.class_name != ''",
            "<if test='college != null and college != \"\"'>AND sp.college = #{college}</if>",
            "<if test='major != null and major != \"\"'>AND sp.major = #{major}</if>",
            "ORDER BY sp.class_name",
            "</script>"
    })
    List<String> selectDistinctClassNames(
            @Param("college") String college,
            @Param("major") String major
    );

    /** 双轨制 filter chip 数据源:从 org_unit 拉书院/楼栋名字 (track='residential')。 */
    @Select({
            "SELECT DISTINCT name FROM org_unit",
            "WHERE deleted_at IS NULL AND track = 'residential' AND type = #{type}",
            "ORDER BY name"
    })
    List<String> selectResidentialUnitNames(@Param("type") String type);

    /**
     * 改"书院班"绑定时下拉用:列出全部书院班 id + name + 所属书院 name,
     * 已删除 / 非 residential 的过滤掉。前端按 academyName 分组渲染。
     * 字段名 dorm_block 是 db 历史名,业务语义上是"书院班"(详见 student.yaml 注释)。
     */
    @Select({
            "SELECT c.id, c.name, p.name AS academy_name",
            "FROM org_unit c LEFT JOIN org_unit p ON p.id = c.parent_id",
            "WHERE c.deleted_at IS NULL AND c.track = 'residential' AND c.type = 'dorm_block'",
            "ORDER BY p.sort_order, p.name, c.sort_order, c.name"
    })
    List<Map<String, Object>> selectResidentialClassesWithAcademy();

    @Select({
            "SELECT sp.id, sp.user_id, sp.student_no,",
            "       u.real_name AS name, u.gender, sp.grade, sp.college, sp.major,",
            "       sp.class_name, u.phone, u.email, sp.status,",
            "       sp.education_level, sp.enrollment_date, sp.created_at,",
            "       sp.extended_info::text AS extended_info",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.id = #{id} AND sp.deleted_at IS NULL"
    })
    StudentView selectStudentById(@Param("id") Long id);

    /**
     * Look up the student profile by sys_user.id rather than student_profile.id.
     * Used by the {@code /students-me} endpoint where the caller is the student
     * themselves and only their {@code X-User-Id} header is in scope.
     */
    @Select({
            "SELECT sp.id, sp.user_id, sp.student_no,",
            "       u.real_name AS name, u.gender, sp.grade, sp.college, sp.major,",
            "       sp.class_name, u.phone, u.email, sp.status,",
            "       sp.education_level, sp.enrollment_date, sp.created_at,",
            "       sp.extended_info::text AS extended_info",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.user_id = #{userId} AND sp.deleted_at IS NULL"
    })
    StudentView selectStudentByUserId(@Param("userId") Long userId);
}
