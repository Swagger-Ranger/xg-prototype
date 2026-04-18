package com.xg.platform.auth.service;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.dto.CurrentUserView;
import com.xg.platform.auth.dto.LoginRequest;
import com.xg.platform.auth.dto.LoginResponse;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.mapper.SysUserRoleMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Demo-grade auth: BCrypt password check against sys_user, returns an opaque
 * token. Identity continues to flow via the X-User-Id / X-Tenant-Id headers
 * already honored by every other controller, so no session store is needed yet.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String DEFAULT_TENANT = "default";

    private final SysUserMapper sysUserMapper;
    private final SysUserRoleMapper sysUserRoleMapper;

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

        CurrentUserView view = buildView(user, tenantId);
        String token = "sess-" + UUID.randomUUID().toString().replace("-", "");

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
        List<String> permissions = sysUserRoleMapper.findPermissionCodesByUserId(user.getId());

        CurrentUserView view = new CurrentUserView();
        view.setId(String.valueOf(user.getId()));
        view.setUsername(user.getUsername());
        view.setRealName(user.getRealName());
        view.setAvatarUrl(user.getAvatarUrl());
        view.setTenantId(tenantId);
        view.setTenantName("默认租户");
        view.setOrgId(null);
        view.setOrgName(null);
        view.setRoleCodes(roleCodes);
        view.setPermissions(permissions);
        return view;
    }
}
