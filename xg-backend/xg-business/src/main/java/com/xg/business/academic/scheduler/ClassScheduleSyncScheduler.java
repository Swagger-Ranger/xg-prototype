package com.xg.business.academic.scheduler;

import com.xg.business.academic.service.ClassScheduleService;
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
 * Daily 03:00 sync of class schedules across every active tenant. Currently
 * the "sync" body is a placeholder: it just timestamps every row's
 * {@code last_synced_at} so the dashboard can show "课表更新于 X" without
 * lying. When the external 教务系统 接口 ships, replace
 * {@link ClassScheduleService#markAllSynced()} with actual fetch + diff.
 *
 * <p>Multi-tenant pattern mirrors {@code AlertScanScheduler} and
 * {@code LeaveReminderScheduler} — list active tenants from public.tenant,
 * push tenant context, run, clear.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClassScheduleSyncScheduler {

    private final DataSource dataSource;
    private final ClassScheduleService scheduleService;

    @Scheduled(cron = "0 0 3 * * *")
    public void dailySync() {
        runOnce("scheduled");
    }

    /** Synchronous run across all active tenants; returns total schedules touched.
     *  Exposed (public) so an admin endpoint can manually retrigger without waiting
     *  for the cron. */
    public int runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int total = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                int touched = scheduleService.markAllSynced();
                total += touched;
                if (touched > 0) {
                    log.info("class schedule sync tenant={} touched={}", tenantId, touched);
                }
            } catch (Exception e) {
                log.warn("class schedule sync failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("class schedule sync [{}] tenants={} total={}", source, tenants.size(), total);
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
