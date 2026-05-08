package com.xg.platform.event.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Daily scan that emits {@code notification_unconfirmed} events for recipients who
 * haven't confirmed an important notification within 48h.
 *
 * <p>Dedup: for each (user_id, notification_id) pair we emit at most one event across
 * the lifetime of the row — checked via a NOT EXISTS against student_event_log.
 * Runs at 01:45 — before alert scan (02:00) so the freshly emitted events can feed
 * the rule engine the same morning.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationUnconfirmedScanScheduler {

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final StudentEventPublisher publisher;

    @Scheduled(cron = "0 45 1 * * *")
    public void dailyScan() {
        runOnce("scheduled");
    }

    public int runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int totalEmitted = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            if (!schema.matches("[a-zA-Z0-9_]+")) continue;
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                totalEmitted += scanTenant(schema);
            } catch (Exception e) {
                log.warn("notification unconfirmed scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("notification unconfirmed scan [{}] done: tenants={} emitted={}",
                source, tenants.size(), totalEmitted);
        return totalEmitted;
    }

    private int scanTenant(String schema) {
        String sql =
                "SELECT r.user_id, r.notification_id " +
                        "FROM " + schema + ".notification_recipient r " +
                        "JOIN " + schema + ".notification n ON n.id = r.notification_id " +
                        "WHERE n.require_confirm = TRUE " +
                        "  AND r.confirmed = FALSE " +
                        "  AND n.created_at < NOW() - INTERVAL '48 hours' " +
                        "  AND NOT EXISTS (" +
                        "       SELECT 1 FROM " + schema + ".student_event_log e " +
                        "       WHERE e.student_id = r.user_id " +
                        "         AND e.event_type = 'notification_unconfirmed' " +
                        "         AND (e.event_data->>'notification_id')::BIGINT = r.notification_id" +
                        "  ) " +
                        "LIMIT 500";
        List<Map<String, Object>> rows = jdbc.queryForList(sql);
        for (Map<String, Object> row : rows) {
            Long studentId = ((Number) row.get("user_id")).longValue();
            Long notificationId = ((Number) row.get("notification_id")).longValue();
            publisher.publish(studentId, StudentEventType.NOTIFICATION_UNCONFIRMED, "notification", Map.of(
                    "notification_id", notificationId,
                    "hours_since_sent", 48
            ));
        }
        return rows.size();
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
