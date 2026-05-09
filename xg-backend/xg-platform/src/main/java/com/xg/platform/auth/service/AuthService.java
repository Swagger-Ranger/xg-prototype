package com.xg.platform.auth.service;

import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.dto.ChangeMyPasswordRequest;
import com.xg.platform.auth.dto.CurrentUserView;
import com.xg.platform.auth.dto.LoginRequest;
import com.xg.platform.auth.dto.LoginResponse;
import com.xg.platform.auth.dto.UpdateMyProfileRequest;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.mapper.SysUserRoleMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 登录服务 + 自助 profile/密码。
 *
 * <p>P2.0 之前是 demo-grade：返回一个 UUID 拼的 token，后端不校验，所有身份靠
 * X-User-Id header 流通。P2.0 起接入 Sa-Token：BCrypt 通过后调用
 * {@code StpUtil.login(userId)} 建真 session，token 用 {@code StpUtil.getTokenValue()}。
 *
 * <p>过渡期 X-User-Id header 路径**仍然有效**（兼容现有 Controller 直接 @RequestHeader
 * 取 userId 的写法），P2.3 全量铺开 @SaCheckPermission 后再废除。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String DEFAULT_TENANT = "default";

    private final SysUserMapper sysUserMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    /** P2.0 起所有"用户的权限码"都走这一条解析（DEFAULTS 别名 + DB 行 + 通配展开）。 */
    private final StpInterface stpInterface;

    @Transactional
    public LoginResponse login(LoginRequest req) {
        String tenantId = (req.getTenantId() == null || req.getTenantId().isBlank())
                ? DEFAULT_TENANT : req.getTenantId();
        applyTenant(tenantId);

        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, req.getUsername())
                        .last("LIMIT 1"));
        if (user == null) {
            throw AuthErrorCode.INVALID_CREDENTIALS.exception();
        }
        if (user.getPasswordHash() == null
                || !BCrypt.checkpw(req.getPassword(), user.getPasswordHash())) {
            throw AuthErrorCode.INVALID_CREDENTIALS.exception();
        }
        if (!"active".equals(user.getStatus())) {
            throw AuthErrorCode.USER_DISABLED.exception();
        }

        user.setLastLoginAt(OffsetDateTime.now());
        sysUserMapper.updateById(user);

        // P2.0：建立真 Sa-Token session。后续 StpUtil.getLoginIdAsLong() 才能拿到 userId，
        // @SaCheckPermission 才能把这条会话当作"已登录"。tenant_id 顺带丢到 session
        // attributes 里，给后台异步任务恢复 TenantContext 用。
        StpUtil.login(user.getId());
        StpUtil.getSession().set("tenantId", tenantId);
        String token = StpUtil.getTokenValue();

        CurrentUserView view = buildView(user, tenantId);
        LoginResponse resp = new LoginResponse();
        resp.setToken(token);
        resp.setRefreshToken(token);
        resp.setUser(view);
        return resp;
    }

    public CurrentUserView me(Long userId) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId.isBlank()) {
            applyTenant(DEFAULT_TENANT);
            tenantId = DEFAULT_TENANT;
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            throw AuthErrorCode.USER_NOT_FOUND.exception();
        }
        return buildView(user, tenantId);
    }

    private void applyTenant(String tenantId) {
        TenantContext.setTenantId(tenantId);
        TenantContext.setSchemaName("tenant_" + tenantId);
    }

    private CurrentUserView buildView(SysUser user, String tenantId) {
        List<String> roleCodes = sysUserRoleMapper.findRoleCodesByUserId(user.getId());
        // 走 StpInterface 而不是直查 sys_role_permission：让 DEFAULTS 别名（如 class_master
        // → teacher 同款权限）和 super_admin 的通配展开都生效。否则前端拿到的 perms 跟
        // /auth/me/perms 不一致，菜单会显示残缺。
        List<String> permissions = stpInterface.getPermissionList(user.getId(), "login");

        CurrentUserView view = new CurrentUserView();
        view.setId(String.valueOf(user.getId()));
        view.setUsername(user.getUsername());
        view.setRealName(user.getRealName());
        view.setAvatarUrl(user.getAvatarUrl());
        view.setEmail(user.getEmail());
        view.setPhone(user.getPhone());
        view.setGender(user.getGender());
        view.setTenantId(tenantId);
        view.setTenantName("默认租户");
        view.setOrgId(null);
        view.setOrgName(null);
        view.setRoleCodes(roleCodes);
        view.setPermissions(permissions);
        return view;
    }

    /** Self-service: limited subset of profile fields. real_name / phone /
     *  username stay admin-managed (audit + identity-linkage concerns). */
    @Transactional
    public CurrentUserView updateMyProfile(Long userId, UpdateMyProfileRequest req) {
        ensureTenant();
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) throw AuthErrorCode.USER_NOT_FOUND.exception();

        if (req.getEmail() != null) user.setEmail(req.getEmail().isBlank() ? null : req.getEmail().trim());
        if (req.getPhone() != null) user.setPhone(req.getPhone().isBlank() ? null : req.getPhone().trim());
        if (req.getGender() != null) {
            String g = req.getGender().trim();
            if (!g.isEmpty() && !"male".equals(g) && !"female".equals(g) && !"unknown".equals(g)) {
                throw AuthErrorCode.INVALID_PROFILE.exception();
            }
            user.setGender(g.isEmpty() ? null : g);
        }
        if (req.getAvatarUrl() != null) {
            user.setAvatarUrl(req.getAvatarUrl().isBlank() ? null : req.getAvatarUrl().trim());
        }
        sysUserMapper.updateById(user);
        return buildView(user, TenantContext.getTenantId());
    }

    /** Self-service password change. Old password must verify; new password
     *  must differ and meet a minimum length. Reset-password (admin) lives on
     *  SystemUserController and skips the old-password check. */
    @Transactional
    public void changeMyPassword(Long userId, ChangeMyPasswordRequest req) {
        ensureTenant();
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) throw AuthErrorCode.USER_NOT_FOUND.exception();
        if (req.getOldPassword() == null || req.getNewPassword() == null) {
            throw AuthErrorCode.INVALID_PROFILE.exception();
        }
        if (user.getPasswordHash() == null
                || !BCrypt.checkpw(req.getOldPassword(), user.getPasswordHash())) {
            throw AuthErrorCode.OLD_PASSWORD_MISMATCH.exception();
        }
        String np = req.getNewPassword();
        if (np.length() < 8 || np.length() > 64) {
            throw AuthErrorCode.WEAK_PASSWORD.exception();
        }
        if (BCrypt.checkpw(np, user.getPasswordHash())) {
            throw AuthErrorCode.SAME_PASSWORD.exception();
        }
        user.setPasswordHash(BCrypt.hashpw(np, BCrypt.gensalt()));
        sysUserMapper.updateById(user);
    }

    private void ensureTenant() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId.isBlank()) {
            applyTenant(DEFAULT_TENANT);
        }
    }
}
