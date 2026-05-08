package com.xg.platform.insight.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.insight.service.InsightService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * Generate workspace insights daily at 02:30 — staggered after AlertScanScheduler (02:00)
 * so event-driven alerts land before insights are rendered.
 *
 * Phase 8A skeleton: iterates tenants and invokes the stub refresh. Phase 8C will:
 *   1. List counselors per tenant and refresh each (role=counselor, scope=userId)
 *   2. Refresh dean (role=dean, scope=global)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InsightScanScheduler {

    private final DataSource dataSource;
    private final InsightService insightService;

    @Scheduled(cron = "0 30 2 * * *")
    public void dailyScan() {
        runOnce("scheduled");
    }

    public void runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int totalRuns = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);

                Long deanUserId = firstUserByRole(schema, 4);
                insightService.refresh("dean", "global",
                        deanUserId == null ? "0" : String.valueOf(deanUserId));
                totalRuns++;

                for (Long counselorId : listCounselors(schema)) {
                    try {
                        insightService.refresh("counselor", String.valueOf(counselorId),
                                String.valueOf(counselorId));
                        totalRuns++;
                    } catch (Exception e) {
                        log.warn("insight refresh failed tenant={} counselor={}", tenantId, counselorId, e);
                    }
                }
            } catch (Exception e) {
                log.warn("insight scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("insight scan [{}] done: tenants={} runs={}", source, tenants.size(), totalRuns);
    }

    private Long firstUserByRole(String schema, int roleId) {
        if (!schema.matches("[a-zA-Z0-9_]+")) return null;
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT u.id FROM " + schema + ".sys_user u " +
                             "JOIN " + schema + ".sys_user_role r ON u.id = r.user_id " +
                             "WHERE r.role_id = " + roleId + " AND u.status = 'active' " +
                             "ORDER BY u.id LIMIT 1")) {
            if (rs.next()) return rs.getLong(1);
        } catch (Exception e) {
            log.warn("firstUserByRole failed schema={} role={}", schema, roleId, e);
        }
        return null;
    }

    private List<Long> listCounselors(String schema) {
        List<Long> ids = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT u.id FROM " + schema + ".sys_user u " +
                             "JOIN " + schema + ".sys_user_role r ON u.id = r.user_id " +
                             "WHERE r.role_id = 2 AND u.status = 'active'")) {
            while (rs.next()) {
                ids.add(rs.getLong(1));
            }
        } catch (Exception e) {
            log.warn("list counselors failed schema={}", schema, e);
        }
        return ids;
    }

    private List<String[]> listActiveTenants() {
        List<String[]> result = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT id, schema_name FROM public.tenant WHERE status = 'active'")) {
            while (rs.next()) {
                result.add(new String[]{rs.getString(1), rs.getString(2)});
            }
        } catch (Exception e) {
            log.warn("list tenants failed", e);
        }
        return result;
    }
}
