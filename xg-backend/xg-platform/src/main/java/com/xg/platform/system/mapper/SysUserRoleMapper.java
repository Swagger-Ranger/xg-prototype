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

    @Select({
            "SELECT DISTINCT ur.user_id FROM sys_user_role ur",
            "JOIN sys_role r ON r.id = ur.role_id",
            "WHERE r.code = #{code} AND r.deleted_at IS NULL"
    })
    List<Long> findUserIdsByRoleCode(@Param("code") String code);

    @Select({
            "SELECT DISTINCT p.code",
            "FROM sys_user_role ur",
            "JOIN sys_role_permission rp ON rp.role_id = ur.role_id",
            "JOIN sys_permission p ON p.id = rp.permission_id",
            "WHERE ur.user_id = #{userId}"
    })
    List<String> findPermissionCodesByUserId(@Param("userId") Long userId);
}
