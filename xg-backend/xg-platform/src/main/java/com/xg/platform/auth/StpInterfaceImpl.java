package com.xg.platform.auth;

import cn.dev33.satoken.stp.StpInterface;
import com.xg.platform.system.mapper.SysUserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Sa-Token 权限解析器。Sa-Token 的 {@code @SaCheckPermission("xx:yy")} 拦截器最终
 * 调用 {@link #getPermissionList(Object, String)} 拿当前用户的权限码列表，再做
 * 字符串匹配。本类把 DB 里的 {@code sys_user_role}、代码里的 {@link RolePermissionDefaults}
 * 合并成最终权限集。
 *
 * <h3>合并规则</h3>
 * <pre>
 *   user 权限 = ⋃ role∈userRoles { DEFAULTS[role.code] } ⋃ DB sys_role_permission rows for those roles
 *   if WILDCARD ∈ above 集合: → 替换为 sys_permission 全表 code 列表
 * </pre>
 *
 * <p>"DEFAULTS + DB" 一开始看起来重复（很多核心 role 在 V020 已经 INSERT 了大致
 * 一致的权限行），但保留 DB 层是为了：
 * <ul>
 *   <li>P3 的"角色权限"配置 UI 可以让管理员加 override（INSERT 新行），无需改代码</li>
 *   <li>老租户已有的 DB 行不会被忽略 —— 即使 DEFAULTS 漏配某权限，DB 里有的依然生效</li>
 * </ul>
 *
 * <h3>super_admin 特殊处理</h3>
 * DEFAULTS 给 super_admin 配的是单元素 <code>{"*"}</code>。本类检测到 WILDCARD 时
 * 直接拉 {@code sys_permission} 全表 code 替换 —— 比给 Sa-Token 装"模式匹配"配置
 * 更简单可控，且新增 perm 自动覆盖。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StpInterfaceImpl implements StpInterface {

    private final SysUserRoleMapper userRoleMapper;

    @Override
    public List<String> getPermissionList(Object loginId, String loginType) {
        Long userId = parseUserId(loginId);
        if (userId == null) {
            return List.of();
        }

        Set<String> perms = new HashSet<>();

        // 1) DEFAULTS 层 —— 按 role.code 查代码里写死的默认权限集
        List<String> roleCodes = userRoleMapper.findRoleCodesByUserId(userId);
        for (String code : roleCodes) {
            perms.addAll(RolePermissionDefaults.defaultsOf(code));
        }

        // 2) DB sys_role_permission 行 —— P3 之后管理员手工 override 的来源；当前
        //    阶段也覆盖了 V020 等老 seed 行，跟 DEFAULTS 取并集，多一道兜底。
        perms.addAll(userRoleMapper.findPermissionCodesByUserId(userId));

        // 3) WILDCARD 展开 —— super_admin 路径
        if (perms.contains(RolePermissionDefaults.WILDCARD)) {
            perms.remove(RolePermissionDefaults.WILDCARD);
            perms.addAll(userRoleMapper.findAllPermissionCodes());
        }

        return new ArrayList<>(perms);
    }

    @Override
    public List<String> getRoleList(Object loginId, String loginType) {
        Long userId = parseUserId(loginId);
        if (userId == null) {
            return List.of();
        }
        return userRoleMapper.findRoleCodesByUserId(userId);
    }

    private static Long parseUserId(Object loginId) {
        if (loginId == null) return null;
        if (loginId instanceof Long l) return l;
        if (loginId instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(loginId.toString());
        } catch (NumberFormatException e) {
            log.warn("Sa-Token loginId not parseable as Long: {}", loginId);
            return null;
        }
    }
}
