package com.xg.platform.platformadmin.bootstrap;

import cn.hutool.crypto.digest.BCrypt;
import com.xg.platform.platformadmin.mapper.PlatformAdminMapper;
import com.xg.platform.platformadmin.model.PlatformAdmin;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Arrays;

/**
 * Seeds the first platform admin on startup if {@code platform_admin} is empty.
 *
 * Resolution order for the initial password:
 *   1. Property {@code xg.platform.bootstrap.password}
 *   2. Env var {@code SUPERADMIN_INITIAL_PASSWORD} (mapped via the property)
 *   3. dev profile fallback {@code Admin@123} (with a loud WARN)
 *
 * In a non-dev profile, missing the password aborts startup — better to fail
 * fast than to ship a default-credential super admin to production.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PlatformAdminBootstrap implements ApplicationRunner {

    private static final String DEV_FALLBACK_PASSWORD = "Admin@123";

    private final PlatformAdminMapper mapper;
    private final Environment environment;

    @Value("${xg.platform.bootstrap.username:superadmin}")
    private String bootstrapUsername;

    @Value("${xg.platform.bootstrap.password:}")
    private String bootstrapPassword;

    @Value("${xg.platform.bootstrap.real-name:平台超级管理员}")
    private String bootstrapRealName;

    @Override
    public void run(ApplicationArguments args) {
        Long count = mapper.selectCount(null);
        if (count != null && count > 0) {
            log.info("Platform admin bootstrap: {} record(s) already present, skip seeding", count);
            return;
        }

        boolean isDev = Arrays.asList(environment.getActiveProfiles()).contains("dev");
        String password = bootstrapPassword;
        if (password == null || password.isBlank()) {
            if (isDev) {
                password = DEV_FALLBACK_PASSWORD;
                log.warn("Platform admin bootstrap: no password configured, using dev fallback. " +
                        "Login as {}/{} and change immediately.", bootstrapUsername, password);
            } else {
                throw new IllegalStateException(
                        "Platform admin bootstrap: platform_admin is empty and " +
                        "xg.platform.bootstrap.password (env SUPERADMIN_INITIAL_PASSWORD) is not set. " +
                        "Refusing to start with default credentials in non-dev profile.");
            }
        }

        PlatformAdmin admin = new PlatformAdmin();
        admin.setUsername(bootstrapUsername);
        admin.setPasswordHash(BCrypt.hashpw(password, BCrypt.gensalt()));
        admin.setRealName(bootstrapRealName);
        admin.setStatus("active");
        admin.setCreatedAt(OffsetDateTime.now());
        admin.setUpdatedAt(OffsetDateTime.now());
        mapper.insert(admin);
        log.info("Platform admin bootstrap: seeded id={} username={}", admin.getId(), admin.getUsername());
    }
}
