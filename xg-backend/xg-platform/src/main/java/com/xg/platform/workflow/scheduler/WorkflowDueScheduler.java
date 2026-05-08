package com.xg.platform.workflow.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.workflow.engine.WorkflowEngine;
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
import java.util.List;

/**
 * Drives time-based workflow nodes (currently: publicity) past their due_at.
 *
 * <p>Per-tenant scan: for each active tenant, switch TenantContext, query
 * task_instance for pending system tasks (assignee_id IS NULL) whose due_at
 * has passed, then ask {@link WorkflowEngine#completePublicity(Long)} to
 * advance each one. Each task runs in its own transaction
 * (REQUIRES_NEW on completePublicity), so a single failure doesn't poison
 * the rest of the batch.
 *
 * <p>Cadence: every 5 minutes. Fine-grained enough that a 5-day publicity
 * lands within minutes of expiry; coarse enough that the cron isn't a hot
 * path. Tune via the cron expression if this becomes a problem.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowDueScheduler {

    private final DataSource dataSource;
    private final WorkflowEngine workflowEngine;

    @Scheduled(cron = "0 */5 * * * *")
    public void scheduledScan() {
        runOnce("scheduled");
    }

    public void runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int totalAdvanced = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                int advanced = scanCurrentTenant();
                totalAdvanced += advanced;
                if (advanced > 0) {
                    log.info("workflow due-scan tenant={} advanced={}", tenantId, advanced);
                }
            } catch (Exception e) {
                log.warn("workflow due-scan failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        if (totalAdvanced > 0) {
            log.info("workflow due-scan [{}] done: tenants={} total_advanced={}",
                    source, tenants.size(), totalAdvanced);
        }
    }

    private int scanCurrentTenant() {
        List<Long> dueTaskIds = new ArrayList<>();
        // Note: we run this raw SELECT against the current schema (set by
        // TenantContext above). MyBatis-Plus mappers depend on tenant interceptor
        // which is fine in normal request scope, but we want a tight scan here
        // without a session. JDBC is sufficient.
        try (Connection conn = dataSource.getConnection()) {
            // Set search_path to tenant schema so the unqualified table name resolves.
            try (Statement s = conn.createStatement()) {
                s.execute("SET search_path TO \"" + TenantContext.getSchemaName() + "\", public");
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT id FROM task_instance " +
                            "WHERE status = 'pending' AND assignee_id IS NULL " +
                            "AND due_at IS NOT NULL AND due_at <= NOW() " +
                            "AND deleted_at IS NULL");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) dueTaskIds.add(rs.getLong(1));
            }
        } catch (Exception e) {
            log.warn("workflow due-scan select failed", e);
            return 0;
        }
        int advanced = 0;
        for (Long taskId : dueTaskIds) {
            try {
                workflowEngine.completePublicity(taskId);
                advanced++;
            } catch (Exception e) {
                log.warn("completePublicity failed taskId={}", taskId, e);
            }
        }
        return advanced;
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
