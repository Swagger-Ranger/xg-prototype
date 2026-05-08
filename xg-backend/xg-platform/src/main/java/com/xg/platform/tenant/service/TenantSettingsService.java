package com.xg.platform.tenant.service;

import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.tenant.dto.TenantSettingsView;
import com.xg.platform.tenant.dto.UpdateTenantSettingsRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Read / write tenant-level settings (school_name, school_city, ...).
 *
 * <p>Uses JdbcTemplate directly rather than the {@link
 * com.xg.platform.tenant.model.Tenant} entity for the school_city column —
 * the column lives in {@code public.tenant} and is added by Flyway V006. If
 * the migration hasn't been applied yet (e.g. column genuinely missing on
 * first boot or someone hasn't restarted), the read path returns {@code
 * null} for school_city and the dashboard's weather widget silently
 * degrades — far better than 500'ing the whole settings page.
 *
 * <p>school_name reads / writes against {@code tenant.name} which has
 * always existed, so that path is unconditional.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TenantSettingsService {

    private static final String DEFAULT_TENANT = "default";

    private final JdbcTemplate jdbc;

    public TenantSettingsView getCurrent() {
        String tenantId = currentTenantId();
        Map<String, Object> base;
        try {
            base = jdbc.queryForMap(
                    "SELECT id, name FROM public.tenant WHERE id = ?", tenantId);
        } catch (EmptyResultDataAccessException ex) {
            throw new BizException("TENANT_NOT_FOUND", "租户不存在");
        }
        TenantSettingsView v = new TenantSettingsView();
        v.setTenantId((String) base.get("id"));
        v.setSchoolName((String) base.get("name"));
        v.setSchoolCity(readSchoolCity(tenantId));
        return v;
    }

    @Transactional
    public TenantSettingsView update(UpdateTenantSettingsRequest req) {
        log.info("[TS-UPDATE] entering: schoolName={} schoolCity={}",
                req.getSchoolName(), req.getSchoolCity());
        String tenantId = currentTenantId();
        log.info("[TS-UPDATE] tenantId={}", tenantId);

        try {
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM public.tenant WHERE id = ?", Integer.class, tenantId);
            log.info("[TS-UPDATE] count rows={}", count);
            if (count == null || count == 0) {
                throw new BizException("TENANT_NOT_FOUND", "租户不存在");
            }
        } catch (BizException biz) {
            throw biz;
        } catch (Exception e) {
            log.error("[TS-UPDATE] count query failed: {}", e.getMessage(), e);
            throw e;
        }

        if (req.getSchoolName() != null) {
            try {
                int affected = jdbc.update(
                        "UPDATE public.tenant SET name = ?, updated_at = NOW() WHERE id = ?",
                        req.getSchoolName().trim(), tenantId);
                log.info("[TS-UPDATE] name UPDATE affected={}", affected);
            } catch (Exception e) {
                log.error("[TS-UPDATE] name UPDATE failed: {}", e.getMessage(), e);
                throw e;
            }
        }
        if (req.getSchoolCity() != null) {
            String v = req.getSchoolCity().trim();
            try {
                int affected = jdbc.update(
                        "UPDATE public.tenant SET school_city = ?, updated_at = NOW() WHERE id = ?",
                        v.isEmpty() ? null : v, tenantId);
                log.info("[TS-UPDATE] school_city UPDATE affected={}", affected);
            } catch (Exception e) {
                log.error("[TS-UPDATE] school_city UPDATE failed (column missing?): {}", e.getMessage(), e);
                throw new BizException("SCHOOL_CITY_COLUMN_MISSING",
                        "数据库还没创建 school_city 列，请重启后端让 Flyway V006 应用");
            }
        }
        log.info("[TS-UPDATE] writes done, refetching view");
        return getCurrent();
    }

    /** Try to read school_city; gracefully return null when the column hasn't
     *  been created yet (V006 not applied). */
    private String readSchoolCity(String tenantId) {
        try {
            return jdbc.queryForObject(
                    "SELECT school_city FROM public.tenant WHERE id = ?",
                    String.class, tenantId);
        } catch (EmptyResultDataAccessException ex) {
            return null;
        } catch (Exception e) {
            log.warn("school_city not readable (V006 not yet applied?): {}", e.getMessage());
            return null;
        }
    }

    private String currentTenantId() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId.isBlank()) tenantId = DEFAULT_TENANT;
        return tenantId;
    }
}
