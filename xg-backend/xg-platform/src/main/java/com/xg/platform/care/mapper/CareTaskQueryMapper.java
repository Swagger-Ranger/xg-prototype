package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 关怀视图的跨模块解析查询。care 在 xg-platform，sys_user / student_profile
 * 属 xg-business（business→platform 单向依赖），不能反向 import 其 mapper ——
 * 走原始 @Select 命中租户表，与 {@link CareRuleQueryMapper} / CareBriefQueryMapper 同范式。
 *
 * <p>显式带 {@code tenant_id = #{tenantId}}：不依赖租户插件是否覆盖这两张表，
 * 跨租户串名是隐私事故，显式过滤兜底，冗余无害。
 */
@Mapper
public interface CareTaskQueryMapper {

    /**
     * 批量解析 studentId → 姓名 + 班级。姓名取 sys_user.real_name，班级取
     * student_profile.class_name（可能无 profile，LEFT JOIN 容 null）。
     * 调用方需保证 studentIds 非空（空集合会拼出非法 {@code IN ()}）。
     *
     * <p><b>别名必须加双引号</b>：Postgres 不带引号的别名会折叠成小写，
     * service 侧按 {@code studentId/studentName/className} 取 Map 会全取空。
     */
    @Select("""
            <script>
            SELECT u.id AS "studentId",
                   u.real_name AS "studentName",
                   sp.class_name AS "className"
              FROM sys_user u
              LEFT JOIN student_profile sp
                     ON sp.user_id = u.id AND sp.tenant_id = #{tenantId}
             WHERE u.tenant_id = #{tenantId}
               AND u.id IN
                   <foreach collection="studentIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<Map<String, Object>> resolveStudents(@Param("tenantId") String tenantId,
                                               @Param("studentIds") List<Long> studentIds);
}
