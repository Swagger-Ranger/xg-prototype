package com.xg.business.student.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.dto.StudentView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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
            "       sp.enrollment_date, sp.created_at",
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
            "ORDER BY sp.created_at DESC",
            "</script>"
    })
    IPage<StudentView> selectStudentPage(
            Page<StudentView> page,
            @Param("keyword") String keyword,
            @Param("grade") String grade,
            @Param("status") String status
    );

    @Select({
            "SELECT sp.id, sp.user_id, sp.student_no,",
            "       u.real_name AS name, u.gender, sp.grade, sp.college, sp.major,",
            "       sp.class_name, u.phone, u.email, sp.status,",
            "       sp.enrollment_date, sp.created_at",
            "FROM student_profile sp",
            "JOIN sys_user u ON u.id = sp.user_id AND u.deleted_at IS NULL",
            "WHERE sp.id = #{id} AND sp.deleted_at IS NULL"
    })
    StudentView selectStudentById(@Param("id") Long id);
}
