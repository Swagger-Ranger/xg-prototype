package com.xg.platform.platformadmin.service;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.platform.platformadmin.dto.PlatformAdminView;
import com.xg.platform.platformadmin.dto.PlatformChangePasswordRequest;
import com.xg.platform.platformadmin.dto.PlatformLoginRequest;
import com.xg.platform.platformadmin.dto.PlatformLoginResponse;
import com.xg.platform.platformadmin.mapper.PlatformAdminMapper;
import com.xg.platform.platformadmin.model.PlatformAdmin;
import com.xg.platform.platformaudit.service.PlatformAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Platform-admin authentication. Tokens are stored in Redis under
 * {@code platform:token:<token>} with a 12h TTL; revoking a session is just
 * a DELETE on the key.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlatformAuthService {

    static final String TOKEN_KEY_PREFIX = "platform:token:";
    static final Duration TOKEN_TTL = Duration.ofHours(12);
    public static final String ROLE_SUPER_ADMIN = "platform_super_admin";

    private final PlatformAdminMapper mapper;
    private final StringRedisTemplate redis;
    private final PlatformAuditService audit;

    @Transactional
    public PlatformLoginResponse login(PlatformLoginRequest req, String ip, String userAgent) {
        PlatformAdmin admin = mapper.selectOne(
                new LambdaQueryWrapper<PlatformAdmin>()
                        .eq(PlatformAdmin::getUsername, req.getUsername())
                        .last("LIMIT 1"));
        if (admin == null
                || admin.getPasswordHash() == null
                || !BCrypt.checkpw(req.getPassword(), admin.getPasswordHash())) {
            audit.log(admin == null ? null : admin.getId(),
                    req.getUsername(), "login.fail",
                    "platform_admin", admin == null ? null : String.valueOf(admin.getId()),
                    "password mismatch", null, null, ip, userAgent);
            throw PlatformAdminErrorCode.INVALID_CREDENTIALS.exception();
        }
        if (!"active".equals(admin.getStatus())) {
            audit.log(admin.getId(), admin.getUsername(), "login.fail",
                    "platform_admin", String.valueOf(admin.getId()),
                    "admin disabled", null, null, ip, userAgent);
            throw PlatformAdminErrorCode.ADMIN_DISABLED.exception();
        }

        admin.setLastLoginAt(OffsetDateTime.now());
        mapper.updateById(admin);

        String token = "padm-" + UUID.randomUUID().toString().replace("-", "");
        redis.opsForValue().set(TOKEN_KEY_PREFIX + token, String.valueOf(admin.getId()), TOKEN_TTL);

        audit.log(admin.getId(), admin.getUsername(), "login.success",
                "platform_admin", String.valueOf(admin.getId()),
                null, null, null, ip, userAgent);

        PlatformLoginResponse resp = new PlatformLoginResponse();
        resp.setToken(token);
        resp.setAdmin(toView(admin));
        return resp;
    }

    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            redis.delete(TOKEN_KEY_PREFIX + token);
        }
    }

    /** Token → admin id lookup used by the auth filter. Returns null when missing/expired. */
    public Long resolveAdminId(String token) {
        if (token == null || token.isBlank()) return null;
        String value = redis.opsForValue().get(TOKEN_KEY_PREFIX + token);
        if (value == null) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public PlatformAdminView me(Long adminId) {
        PlatformAdmin admin = mapper.selectById(adminId);
        if (admin == null) throw PlatformAdminErrorCode.ADMIN_NOT_FOUND.exception();
        return toView(admin);
    }

    @Transactional
    public void changeMyPassword(Long adminId, PlatformChangePasswordRequest req,
                                 String ip, String userAgent) {
        PlatformAdmin admin = mapper.selectById(adminId);
        if (admin == null) throw PlatformAdminErrorCode.ADMIN_NOT_FOUND.exception();
        if (admin.getPasswordHash() == null
                || !BCrypt.checkpw(req.getOldPassword(), admin.getPasswordHash())) {
            throw PlatformAdminErrorCode.OLD_PASSWORD_MISMATCH.exception();
        }
        String np = req.getNewPassword();
        if (np.length() < 8 || np.length() > 64) {
            throw PlatformAdminErrorCode.WEAK_PASSWORD.exception();
        }
        if (BCrypt.checkpw(np, admin.getPasswordHash())) {
            throw PlatformAdminErrorCode.SAME_PASSWORD.exception();
        }
        admin.setPasswordHash(BCrypt.hashpw(np, BCrypt.gensalt()));
        mapper.updateById(admin);
        audit.log(admin.getId(), admin.getUsername(), "admin.password_change",
                "platform_admin", String.valueOf(admin.getId()),
                "self password change", null, null, ip, userAgent);
    }

    PlatformAdminView toView(PlatformAdmin admin) {
        PlatformAdminView v = new PlatformAdminView();
        v.setId(String.valueOf(admin.getId()));
        v.setUsername(admin.getUsername());
        v.setRealName(admin.getRealName());
        v.setPhone(admin.getPhone());
        v.setEmail(admin.getEmail());
        v.setStatus(admin.getStatus());
        v.setLastLoginAt(admin.getLastLoginAt());
        v.setCreatedAt(admin.getCreatedAt());
        v.setRoleCodes(List.of(ROLE_SUPER_ADMIN));
        return v;
    }
}
