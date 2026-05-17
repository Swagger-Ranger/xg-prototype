package com.xg.business.dataimport.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * 导入执行阶段的写入 + 校验查询。多租户由 MyBatis-Plus 插件自动加 tenant_id 谓词。
 *
 * <p>org_unit 没有 Java entity，直接走 SQL；id 由 service 用 IdWorker 雪花生成传入。
 * sys_user / student_profile 有 entity，走对应 mapper 的 insert 即可。
 */
@Mapper
public interface DataImportWriteMapper {

    /** 写 org_unit；parent_id 允许 NULL（学院顶层）。code 可空，UI 不填即可。 */
    @Insert("""
            INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status)
            VALUES (#{id}, #{tenantId}, #{parentId}, #{name}, #{code}, #{type}, 0, 'active')
            """)
    int insertOrgUnit(@Param("id") Long id,
                      @Param("tenantId") String tenantId,
                      @Param("parentId") Long parentId,
                      @Param("name") String name,
                      @Param("code") String code,
                      @Param("type") String type);

    /**
     * 维护 org_closure：新节点对自身 depth=0 + 继承父链。
     * parentId 为 NULL 时只写 (self,self,0)。
     */
    @Insert("""
            INSERT INTO org_closure (ancestor_id, descendant_id, depth)
            SELECT ancestor_id, #{newId}, depth + 1
              FROM org_closure
             WHERE descendant_id = #{parentId}
            UNION ALL
            SELECT #{newId}, #{newId}, 0
            ON CONFLICT DO NOTHING
            """)
    int insertOrgClosure(@Param("newId") Long newId,
                         @Param("parentId") Long parentId);

    /** parentId 为 NULL 时只写 self-link，避免上面 SQL 的 WHERE 命中空集后整个 UNION 失效。 */
    @Insert("""
            INSERT INTO org_closure (ancestor_id, descendant_id, depth)
            VALUES (#{newId}, #{newId}, 0)
            ON CONFLICT DO NOTHING
            """)
    int insertOrgClosureSelf(@Param("newId") Long newId);

    /**
     * 按学号查 student_profile + 关联的 sys_user.id。返回 0 / 1 行。
     * 列：profile_id, user_id, student_no, college, major, class_name, class_id, phone, email, real_name
     */
    @Select("""
            SELECT sp.id AS profile_id, sp.user_id, sp.student_no,
                   sp.college, sp.major, sp.class_name, sp.class_id,
                   u.phone, u.email, u.real_name
              FROM student_profile sp
              JOIN sys_user u ON u.id = sp.user_id
             WHERE sp.student_no = #{studentNo}
               AND sp.deleted_at IS NULL
               AND u.deleted_at IS NULL
             LIMIT 1
            """)
    Map<String, Object> findStudentByNo(@Param("studentNo") String studentNo);

    /** 批量查学号是否在表里（用 IN 列表）。返回命中的学号集合。 */
    @Select({
            "<script>",
            "SELECT student_no FROM student_profile",
            " WHERE deleted_at IS NULL AND student_no IN",
            " <foreach collection='nos' item='no' open='(' separator=',' close=')'>#{no}</foreach>",
            "</script>"
    })
    List<String> findExistingStudentNos(@Param("nos") List<String> nos);

    /** sys_user 用户名是否已被占（同租户内）。null = 没占。 */
    @Select("""
            SELECT id FROM sys_user
             WHERE username = #{username}
               AND deleted_at IS NULL
             LIMIT 1
            """)
    Long findUserIdByUsername(@Param("username") String username);

    @Update("""
            UPDATE sys_user
               SET phone = COALESCE(#{phone}, phone),
                   email = COALESCE(#{email}, email),
                   real_name = COALESCE(#{realName}, real_name),
                   gender = COALESCE(#{gender}, gender),
                   updated_at = NOW(),
                   updated_by = #{operator}
             WHERE id = #{userId}
               AND deleted_at IS NULL
            """)
    int patchSysUser(@Param("userId") Long userId,
                     @Param("phone") String phone,
                     @Param("email") String email,
                     @Param("realName") String realName,
                     @Param("gender") String gender,
                     @Param("operator") Long operator);

    @Update("""
            UPDATE student_profile
               SET grade      = COALESCE(#{grade}, grade),
                   college    = COALESCE(#{college}, college),
                   major      = COALESCE(#{major}, major),
                   class_name = COALESCE(#{className}, class_name),
                   class_id   = COALESCE(#{classId}, class_id),
                   updated_at = NOW(),
                   updated_by = #{operator}
             WHERE id = #{profileId}
               AND deleted_at IS NULL
            """)
    int patchStudentProfile(@Param("profileId") Long profileId,
                            @Param("grade") String grade,
                            @Param("college") String college,
                            @Param("major") String major,
                            @Param("className") String className,
                            @Param("classId") Long classId,
                            @Param("operator") Long operator);

    /** 按 code 查角色 id（同租户内）。当前用法：student / counselor / teacher。 */
    @Select("""
            SELECT id FROM sys_role
             WHERE code = #{code}
               AND deleted_at IS NULL
             LIMIT 1
            """)
    Long findRoleIdByCode(@Param("code") String code);

    /**
     * 按 code 或 中文 name 查角色（辅导员场景"角色"列里两种写法都能写）。
     * 例：key='counselor' 或 key='辅导员' 都命中 sys_role(code='counselor', name='辅导员')。
     */
    @Select("""
            SELECT id FROM sys_role
             WHERE (code = #{key} OR name = #{key})
               AND deleted_at IS NULL
             LIMIT 1
            """)
    Long findRoleIdByCodeOrName(@Param("key") String key);

    /**
     * 同租户内所有角色的可识别 key：code 与 name 并集。
     * Step 4 预检阶段一次性拉到内存做集合包含判断，避免 N 次 SQL。
     */
    @Select("""
            SELECT code FROM sys_role WHERE deleted_at IS NULL
            UNION ALL
            SELECT name FROM sys_role WHERE deleted_at IS NULL
            """)
    List<String> findAllRoleKeys();

    /**
     * 给 user 绑角色。org_id 可为 null（全局角色，如 student）。
     * sys_user_role PK 是 (user_id, role_id)，再次写入时 **更新 org_id**
     * —— 教师从计算机学院换到数学学院的场景必须这样改才能生效。
     * 学生 org_id 永远 NULL，DO UPDATE 是 no-op。
     */
    @Insert("""
            INSERT INTO sys_user_role (user_id, role_id, org_id)
            VALUES (#{userId}, #{roleId}, #{orgId})
            ON CONFLICT (user_id, role_id) DO UPDATE SET org_id = EXCLUDED.org_id
            """)
    int insertUserRole(@Param("userId") Long userId,
                       @Param("roleId") Long roleId,
                       @Param("orgId") Long orgId);

    /**
     * 按名字找 org_unit（学院或机关部门）。教师/辅导员的"所在单位"解析用。
     * 同租户内同名节点只取一个；学校命名实践基本满足唯一。
     */
    @Select("""
            SELECT id FROM org_unit
             WHERE name = #{name}
               AND type IN ('college', 'admin_dept')
               AND status = 'active'
               AND deleted_at IS NULL
             ORDER BY type   -- college 优先于 admin_dept (同名时选学院)
             LIMIT 1
            """)
    Long findOrgIdByName(@Param("name") String name);

    /** 批量查 username 是否已占（教师/辅导员场景的冲突检测）。 */
    @Select({
            "<script>",
            "SELECT username FROM sys_user",
            " WHERE deleted_at IS NULL AND username IN",
            " <foreach collection='names' item='n' open='(' separator=',' close=')'>#{n}</foreach>",
            "</script>"
    })
    List<String> findExistingUsernames(@Param("names") List<String> names);
}
