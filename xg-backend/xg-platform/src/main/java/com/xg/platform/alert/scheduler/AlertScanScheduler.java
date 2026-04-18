package com.xg.platform.alert.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.alert.service.StudentAlertService;
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

@Slf4j
@Component
@RequiredArgsConstructor
public class AlertScanScheduler {

    private final DataSource dataSource;
    private final StudentAlertService alertService;

    /**
     * Run daily at 02:00 — iterate all active tenants, evaluate every enabled rule.
     */
    @Scheduled(cron = "0 0 2 * * *")
    public void dailyScan() {
        runOnce("scheduled");
    }

    public void runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int totalAlerts = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                int inserted = alertService.scanCurrentTenant();
                totalAlerts += inserted;
                log.info("alert scan tenant={} inserted={}", tenantId, inserted);
            } catch (Exception e) {
                log.warn("alert scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("alert scan [{}] done: tenants={} total_alerts_inserted={}", source, tenants.size(), totalAlerts);
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
