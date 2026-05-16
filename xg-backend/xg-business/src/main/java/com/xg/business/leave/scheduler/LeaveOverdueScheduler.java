package com.xg.business.leave.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * R007 埋点：请假到期 48h 未销假 → 发 {@code leave_overdue} 事件喂主动关怀规则引擎。
 *
 * <p>为什么是独立 scheduler 而不是改 LeaveReturnService：销假是用户主动动作，
 * "超期未销假"是时间推移的被动事实，没有业务动作可以挂钩，只能定时扫。
 *
 * <p>每小时扫一次（48h SLA 不能等一天）。多租户循环沿用 AlertScanScheduler / LeaveReminderScheduler 模式。
 * 去重靠下游 CareScanService 的 cooldown（同一请假记录重复发事件无害，规则侧按 student+rule 冷却）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LeaveOverdueScheduler {

    private final DataSource dataSource;
    private final StudentEventPublisher eventPublisher;

    @Scheduled(cron = "0 0 * * * *")
    public void scan() {
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
                total += scanCurrentTenant(schema);
            } catch (Exception e) {
                log.warn("leave overdue scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("leave overdue scan [{}] tenants={} events_total={}", source, tenants.size(), total);
        return total;
    }

    /**
     * 扫描当前租户：approved 且未销假且到期 48h 的请假。schema 名来自 public.tenant，
     * 受信任（非用户输入），直接拼接 —— 与 WorkspaceMetricsService 等现有代码一致。
     */
    private int scanCurrentTenant(String schema) {
        // NOT EXISTS 去重：同一条请假只发一次 leave_overdue，否则每小时扫描会对同一
        // 未销假记录反复发事件、撑爆 student_event_log（一条逾期请假积一周=168 条重复）。
        String sql = "SELECT lr.id, lr.student_id, lr.end_time FROM " + schema + ".leave_request lr "
                + "WHERE lr.status = 'approved' AND lr.cancel_time IS NULL "
                + "AND lr.end_time + INTERVAL '48 hours' < NOW() "
                + "AND NOT EXISTS (SELECT 1 FROM " + schema + ".student_event_log e "
                + "WHERE e.source_id = lr.id AND e.event_type = 'leave_overdue')";
        int fired = 0;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                long leaveId = rs.getLong("id");
                long studentId = rs.getLong("student_id");
                Map<String, Object> data = new HashMap<>();
                data.put("leave_request_id", leaveId);
                data.put("end_time", String.valueOf(rs.getObject("end_time")));
                eventPublisher.publishWithSource(
                        studentId, StudentEventType.LEAVE_OVERDUE, "leave", leaveId, data);
                fired++;
            }
        } catch (Exception e) {
            log.warn("leave overdue query failed schema={}", schema, e);
        }
        return fired;
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
