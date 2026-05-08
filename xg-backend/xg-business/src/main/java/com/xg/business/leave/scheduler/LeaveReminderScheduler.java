package com.xg.business.leave.scheduler;

import com.xg.business.leave.service.LeaveReminderService;
import com.xg.common.tenant.TenantContext;
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
 * Iterates every active tenant on a 15-minute cadence and asks
 * {@link LeaveReminderService} to fire any due time-based leave reminders
 * (start / pre_end / due / overdue). Mirrors the multi-tenant pattern used by
 * {@code AlertScanScheduler}: the service is tenant-agnostic, this class
 * sets/clears {@link TenantContext} around each call.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LeaveReminderScheduler {

    private final DataSource dataSource;
    private final LeaveReminderService reminderService;

    @Scheduled(cron = "0 */15 * * * *")
    public void scan() {
        runOnce("scheduled");
    }

    /** Runs the scan synchronously across all active tenants and returns the
     *  total number of reminders fired. Called by both the cron and the admin
     *  trigger endpoint. */
    public int runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int total = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                int fired = reminderService.scanCurrentTenant();
                total += fired;
                if (fired > 0) {
                    log.info("leave reminder tenant={} fired={}", tenantId, fired);
                }
            } catch (Exception e) {
                log.warn("leave reminder scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("leave reminder scan [{}] tenants={} fired_total={}", source, tenants.size(), total);
        return total;
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
