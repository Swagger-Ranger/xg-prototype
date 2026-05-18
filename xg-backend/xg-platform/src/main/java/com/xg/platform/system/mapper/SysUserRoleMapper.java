package com.xg.platform.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.system.model.SysUserRole;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysUserRoleMapper extends BaseMapper<SysUserRole> {

    @Select({
            "SELECT r.code FROM sys_role r",
            "JOIN sys_user_role ur ON ur.role_id = r.id",
            "WHERE ur.user_id = #{userId} AND r.deleted_at IS NULL"
    })
    List<String> findRoleCodesByUserId(@Param("userId") Long userId);

    /**
     * 仅 kind='role' 的角色码 —— 给 {@link com.xg.platform.auth.StpInterfaceImpl}
     * 展开 {@link com.xg.platform.auth.RolePermissionDefaults} 用。
     *
     * <p>与 findRoleCodesByUserId(全部,含 team)拆开:DEFAULTS 展开必须只认 kind='role',
     * 否则某 team 的 code 撞上 DEFAULTS key(如 'aid_center_officer')时,加入团队即经默认
     * 权限提权。createRole 已禁止 team code 与内置重名,但数据导入 / 后补 DEFAULTS key 会
     * 绕过该校验 —— 这里做结构性兜底,功能权限只来自 kind='role'(RBAC 落地方案 §6.2/§6.3)。
     */
    @Select({
            "SELECT r.code FROM sys_role r",
            "JOIN sys_user_role ur ON ur.role_id = r.id",
            "WHERE ur.user_id = #{userId} AND r.kind = 'role' AND r.deleted_at IS NULL"
    })
    List<String> findFunctionalRoleCodesByUserId(@Param("userId") Long userId);

    @Select({
            "SELECT DISTINCT ur.user_id FROM sys_user_role ur",
            "JOIN sys_role r ON r.id = ur.role_id",
            "WHERE r.code = #{code} AND r.deleted_at IS NULL"
    })
    List<Long> findUserIdsByRoleCode(@Param("code") String code);

    /** 用于"用户管理列表排除学生"等批量场景。codes 为空时返回空列表（避免 IN ()）。 */
    @Select({
            "<script>",
            "SELECT DISTINCT ur.user_id FROM sys_user_role ur",
            "JOIN sys_role r ON r.id = ur.role_id",
            "WHERE r.deleted_at IS NULL AND r.code IN",
            "<foreach item='c' collection='codes' open='(' separator=',' close=')'>#{c}</foreach>",
            "</script>"
    })
    List<Long> findUserIdsByRoleCodes(@Param("codes") List<String> codes);

    /**
     * team→权限提权的 <b>DB sys_role_permission 一条腿</b>:kind='team' 即使误配了
     * sys_role_permission,也不让加入团队的人经本查询拿到功能权限(RBAC 落地方案 §6)。
     *
     * <p><b>另一条腿(DEFAULTS 展开)已在 Sprint 3 关闭</b>:StpInterfaceImpl 的
     * RolePermissionDefaults 展开改走 {@link #findFunctionalRoleCodesByUserId}
     * (同样 kind='role')。两条腿现都只认 kind='role',team 不带任何功能权限。
     *
     * <p>注意:仅本查询与 findFunctionalRoleCodesByUserId 过滤 kind;
     * findRoleCodesByUserId 等业务 scope / roles.contains 查询绝不能加,否则破坏判断。
     */
    @Select({
            "SELECT DISTINCT p.code",
            "FROM sys_user_role ur",
            "JOIN sys_role r ON r.id = ur.role_id",
            "JOIN sys_role_permission rp ON rp.role_id = ur.role_id",
            "JOIN sys_permission p ON p.id = rp.permission_id",
            "WHERE ur.user_id = #{userId}",
            "AND r.kind = 'role' AND r.deleted_at IS NULL"
    })
    List<String> findPermissionCodesByUserId(@Param("userId") Long userId);

    /**
     * 全租户的权限码总集 —— super_admin 把这一整套都拿到，就不用维护"新增 perm 时
     * 同步更新 super_admin DEFAULTS"。{@link com.xg.platform.auth.StpInterfaceImpl}
     * 在检测到 wildcard 时调用。
     */
    @Select("SELECT code FROM sys_permission")
    List<String> findAllPermissionCodes();
}
