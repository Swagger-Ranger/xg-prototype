package com.xg.platform.system.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 「角色权限」管理页用的低层 SQL。跟现有 SysRoleMapper / SysUserRoleMapper 区分开，
 * 因为这些查询是 admin 配置场景独有，不该污染那些跑在登录态热路径的查询。
 *
 * <p>所有读写都跑在 MyBatis-Plus 多租户插件下，自动加 tenant_id 谓词；这里只写业务。
 */
@Mapper
public interface RolePermissionAdminMapper {

    /** 列所有角色，附带 sys_role_permission 表里挂的"显式授权"行数（不含 DEFAULTS）。 */
    @Select("""
            SELECT r.id, r.code, r.name, r.description, r.is_builtin, r.sort_order,
                   COALESCE(c.cnt, 0) AS db_perm_count
              FROM sys_role r
              LEFT JOIN (
                  SELECT role_id, COUNT(*) AS cnt
                    FROM sys_role_permission
                   GROUP BY role_id
              ) c ON c.role_id = r.id
             WHERE r.deleted_at IS NULL
             ORDER BY r.sort_order, r.id
            """)
    List<Map<String, Object>> listRolesWithDbPermCount();

    /** 列所有权限码（管理 UI 渲染权限矩阵的字典源）。 */
    @Select("""
            SELECT id, code, name, module, type, sort_order
              FROM sys_permission
             ORDER BY module NULLS LAST, sort_order, id
            """)
    List<Map<String, Object>> listAllPermissions();

    /** 根据 role.code 拿 (id, name, is_builtin)；不存在返回空 list。 */
    @Select("""
            SELECT id, code, name, description, is_builtin, sort_order
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

    /** 移除一条 override。affected=0 表示本来就没有，前端按 success 处理（幂等）。 */
    @Delete("""
            DELETE FROM sys_role_permission
             WHERE role_id = #{roleId}
               AND permission_id = #{permissionId}
            """)
    int deleteRolePermission(@Param("roleId") Long roleId,
                             @Param("permissionId") Long permissionId);
}
