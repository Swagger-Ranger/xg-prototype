package com.xg.platform.care.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.service.CareScanService;
import com.xg.platform.care.service.CareTaskService;
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
 * 关怀规则每日扫描。多租户循环沿用 AlertScanScheduler / LeaveReminderScheduler 模式：
 * service 本身租户无关，本类负责 set/clear {@link TenantContext}。
 *
 * <p>02:30 跑（让 02:00 的 alert 扫描先跑完，且 R007 依赖每小时的 LeaveOverdueScheduler 已铺好事件）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CareScanScheduler {

    private final DataSource dataSource;
    private final CareScanService careScanService;
    private final CareTaskService careTaskService;

    @Scheduled(cron = "0 30 2 * * *")
    public void dailyScan() {
        runOnce("scheduled");
    }

    public int runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int total = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                // 先把 SLA 已过的任务推进 overdue，再跑规则生成（顺序无强依赖，但先反映超期更直观）
                // 注：每日 02:30 粒度；若需 SLA 分钟级精度，W2.4 可拆独立高频 scheduler
                int overdue = careTaskService.tickOverdue();
                if (overdue > 0) {
                    log.info("care overdue tick tenant={} migrated={}", tenantId, overdue);
                }
                int created = careScanService.scanCurrentTenant();
                total += created;
                if (created > 0) {
                    log.info("care scan tenant={} created={}", tenantId, created);
                }
            } catch (Exception e) {
                log.warn("care scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("care scan [{}] tenants={} tasks_created_total={}", source, tenants.size(), total);
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
