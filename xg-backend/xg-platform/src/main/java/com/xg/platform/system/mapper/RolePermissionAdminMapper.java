package com.xg.platform.system.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 「角色权限」/「团队管理」管理页用的低层 SQL。跟现有 SysRoleMapper / SysUserRoleMapper 区分开，
 * 因为这些查询是 admin 配置场景独有，不该污染那些跑在登录态热路径的查询。
 *
 * <p>所有读写都跑在 MyBatis-Plus 多租户插件下,自动加 tenant_id 谓词。
 */
@Mapper
public interface RolePermissionAdminMapper {

    /**
     * 列角色列表,可按 kind / archived 过滤。member_count 来自 sys_user_role 行数。
     *
     * @param kind     'role' / 'team' / null(不过滤)
     * @param archived 仅当 kind='team' 时生效:true=archived_at NOT NULL,false=archived_at IS NULL,null=不过滤
     * @param keyword  按 name LIKE 模糊匹配,可空
     */
    @Select("""
            <script>
            SELECT r.id, r.code, r.name, r.description, r.is_builtin, r.sort_order,
                   r.kind, r.team_type, r.start_date, r.end_date, r.archived_at,
                   COALESCE(c.cnt, 0) AS db_perm_count,
                   COALESCE(m.cnt, 0) AS member_count
              FROM sys_role r
              LEFT JOIN (
                  SELECT role_id, COUNT(*) AS cnt
                    FROM sys_role_permission
                   GROUP BY role_id
              ) c ON c.role_id = r.id
              LEFT JOIN (
                  SELECT role_id, COUNT(*) AS cnt
                    FROM sys_user_role
                   GROUP BY role_id
              ) m ON m.role_id = r.id
             WHERE r.deleted_at IS NULL
            <if test="kind != null">  AND r.kind = #{kind} </if>
            <if test="archived != null and archived == true">  AND r.archived_at IS NOT NULL </if>
            <if test="archived != null and archived == false"> AND r.archived_at IS NULL </if>
            <if test="keyword != null and keyword != ''">     AND r.name LIKE CONCAT('%', #{keyword}, '%') </if>
             ORDER BY r.sort_order, r.id
            </script>
            """)
    List<Map<String, Object>> listRoles(@Param("kind") String kind,
                                         @Param("archived") Boolean archived,
                                         @Param("keyword") String keyword);

    /** 列所有权限码（管理 UI 渲染权限矩阵的字典源）。 */
    @Select("""
            SELECT id, code, name, module, type, sort_order
              FROM sys_permission
             ORDER BY module NULLS LAST, sort_order, id
            """)
    List<Map<String, Object>> listAllPermissions();

    /** 根据 role.code 拿全字段(含 team 列)。不存在返回空 list。 */
    @Select("""
            SELECT id, code, name, description, is_builtin, sort_order,
                   kind, team_type, start_date, end_date, archived_at
              FROM sys_role
             WHERE code = #{code} AND deleted_at IS NULL
            """)
    List<Map<String, Object>> findRoleByCode(@Param("code") String code);

    /** 该 role 在 sys_role_permission 表里挂的权限 code 列表（即"override 加"项）。 */
    @Select("""
            SELECT p.code
              FROM sys_role_permission rp
              JOIN sys_permission p ON p.id = rp.permission_id
             WHERE rp.role_id = #{roleId}
            """)
    List<String> findOverridePermCodes(@Param("roleId") Long roleId);

    @Select("SELECT id FROM sys_permission WHERE code = #{code}")
    Long findPermissionIdByCode(@Param("code") String code);

    /** 加一条 (role, perm) override。重复无害（ON CONFLICT 跳过）。 */
    @Insert("""
            INSERT INTO sys_role_permission (role_id, permission_id)
            VALUES (#{roleId}, #{permissionId})
            ON CONFLICT (role_id, permission_id) DO NOTHING
            """)
    int insertRolePermission(@Param("roleId") Long roleId,
                             @Param("permissionId") Long permissionId);

    /** 移除一条 override。affected=0 表示本来就没有,前端按 success 处理(幂等)。 */
    @Delete("""
            DELETE FROM sys_role_permission
             WHERE role_id = #{roleId}
               AND permission_id = #{permissionId}
            """)
    int deleteRolePermission(@Param("roleId") Long roleId,
                             @Param("permissionId") Long permissionId);

    // ===== 自定义角色 / 团队 CRUD(is_builtin=false) =====

    /** 新建自定义角色 或 团队。kind / teamType / dates 由调用方传入。 */
    @Insert("""
            INSERT INTO sys_role
                (id, tenant_id, code, name, description, is_builtin, sort_order,
                 kind, team_type, start_date, end_date)
            VALUES
                (#{id}, #{tenantId}, #{code}, #{name}, #{description}, FALSE, 999,
                 #{kind}, #{teamType}, #{startDate}, #{endDate})
            """)
    int insertCustomRole(@Param("id") Long id,
                         @Param("tenantId") String tenantId,
                         @Param("code") String code,
                         @Param("name") String name,
                         @Param("description") String description,
                         @Param("kind") String kind,
                         @Param("teamType") String teamType,
                         @Param("startDate") LocalDate startDate,
                         @Param("endDate") LocalDate endDate);

    /** 改自定义角色的 name / description。is_builtin / code 不可改。 */
    @Update("""
            UPDATE sys_role
               SET name = #{name},
                   description = #{description},
                   updated_at = NOW()
             WHERE code = #{code}
               AND is_builtin = FALSE
               AND deleted_at IS NULL
            """)
    int updateCustomRole(@Param("code") String code,
                         @Param("name") String name,
                         @Param("description") String description);

    /** 改团队专属字段(team_type / start_date / end_date)。仅作用于 kind='team' 且非内置的行。 */
    @Update("""
            UPDATE sys_role
               SET team_type = #{teamType},
                   start_date = #{startDate},
                   end_date = #{endDate},
                   updated_at = NOW()
             WHERE code = #{code}
               AND kind = 'team'
               AND is_builtin = FALSE
               AND deleted_at IS NULL
            """)
    int updateTeamFields(@Param("code") String code,
                         @Param("teamType") String teamType,
                         @Param("startDate") LocalDate startDate,
                         @Param("endDate") LocalDate endDate);

    /** 归档:archived_at = NOW()。仅作用于 kind='team' 行。 */
    @Update("""
            UPDATE sys_role
               SET archived_at = NOW(),
                   updated_at = NOW()
             WHERE code = #{code}
               AND kind = 'team'
               AND deleted_at IS NULL
               AND archived_at IS NULL
            """)
    int archiveTeam(@Param("code") String code);

    /** 撤销归档:archived_at = NULL。 */
    @Update("""
            UPDATE sys_role
               SET archived_at = NULL,
                   updated_at = NOW()
             WHERE code = #{code}
               AND kind = 'team'
               AND deleted_at IS NULL
               AND archived_at IS NOT NULL
            """)
    int unarchiveTeam(@Param("code") String code);

    /** 软删除:deleted_at = NOW()。只允许删非内置角色 / 团队。 */
    @Update("""
            UPDATE sys_role
               SET deleted_at = NOW(),
                   updated_at = NOW()
             WHERE code = #{code}
               AND is_builtin = FALSE
               AND deleted_at IS NULL
            """)
    int softDeleteCustomRole(@Param("code") String code);

    /**
     * 检查删除前:该角色 / 团队是否还有用户绑定。
     *
     * <p>显式 JOIN sys_user + tenant_id 过滤,而不依赖多租户插件对裸 @Select 的拦截:
     * 防止跨租户的绑定让本租户误判"还有绑定无法删"或反之误删。
     */
    @Select("""
            SELECT COUNT(*) FROM sys_user_role ur
              JOIN sys_user u ON u.id = ur.user_id
             WHERE ur.role_id = #{roleId}
               AND u.tenant_id = #{tenantId}
            """)
    int countUsersBoundToRole(@Param("roleId") Long roleId,
                              @Param("tenantId") String tenantId);
}
