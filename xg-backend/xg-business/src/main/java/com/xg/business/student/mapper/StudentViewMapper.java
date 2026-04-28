package com.xg.business.student.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.dto.StudentView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Custom SQL mapper for joined sys_user + student_profile views.
 * Tenant isolation is handled by TenantSchemaInterceptor (SET search_path per request).
 * Snake-case columns are mapped to camelCase fields via map-underscore-to-camel-case.
 */
@Mapper
public interface StudentViewMapper {

    @Select({
            "<script>",
            "SELECT sp.id, sp.user_id, sp.student_no,",
            "       u.real_name AS name, u.gender, sp.grade, sp.college, sp.major,",
            "       sp.class_name, u.phone, u.email, sp.status,",
            "       sp.education_level, sp.enrollment_date, sp.created_at,",
            "       sp.extended_info::text AS extended_info",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.deleted_at IS NULL",
            "<if test='keyword != null and keyword != \"\"'>",
            "  AND (u.real_name ILIKE CONCAT('%', #{keyword}, '%')",
            "       OR sp.student_no ILIKE CONCAT('%', #{keyword}, '%')",
            "       OR u.phone ILIKE CONCAT('%', #{keyword}, '%'))",
            "</if>",
            "<if test='grade != null and grade != \"\"'>AND sp.grade = #{grade}</if>",
            "<if test='status != null and status != \"\"'>AND sp.status = #{status}</if>",
            "<if test='college != null and college != \"\"'>AND sp.college = #{college}</if>",
            "<if test='major != null and major != \"\"'>AND sp.major = #{major}</if>",
            "<if test='className != null and className != \"\"'>AND sp.class_name = #{className}</if>",
            "ORDER BY sp.created_at DESC",
            "</script>"
    })
    IPage<StudentView> selectStudentPage(
            Page<StudentView> page,
            @Param("keyword") String keyword,
            @Param("grade") String grade,
            @Param("status") String status,
            @Param("college") String college,
            @Param("major") String major,
            @Param("className") String className
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
}
