package com.xg.platform.care.scheduler;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.service.CareNotifyPolicy;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * medium 关怀任务每日 09:00 聚合提醒（PRD §12.3）。多租户循环沿用
 * {@link CareScanScheduler} 范式（service 租户无关，scheduler set/clear
 * {@link TenantContext}）。
 *
 * <p>每个责任辅导员一条聚合（只写数量 + 入口，§12.2）。digest 是聚合而非
 * 单任务事件，<b>sourceId 传 null</b>：通知去重唯一索引
 * {@code (source_type, source_id, template_code) WHERE source_id NOT NULL}
 * 对 null 不生效 —— 正是聚合通知该走的路（每天都发，不被昨天那条挡掉）。
 * sys_user.id 是雪花大整数，无法把 (日期, 辅导员) 安全编进一个 Long。
 *
 * <p>§12.3「节假日不推 medium 日聚合」：仓库无节假日日历，本期不做，待接入
 * 日历后在入口处加一层 skip。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CareDailyDigestScheduler {

    private static final List<String> OPEN_STATUSES =
            List.of("pending", "accepted", "in_progress", "overdue");

    private final DataSource dataSource;
    private final CareTaskMapper careTaskMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    @Scheduled(cron = "0 0 9 * * *")
    public void dailyDigest() {
        runOnce();
    }

    public int runOnce() {
        List<String[]> tenants = listActiveTenants();
        int totalCounselors = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(t[1]);
                totalCounselors += digestForTenant(tenantId);
            } catch (Exception e) {
                log.warn("care daily digest failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("care daily digest tenants={} counselors_notified_total={}",
                tenants.size(), totalCounselors);
        return totalCounselors;
    }

    private int digestForTenant(String tenantId) {
        List<CareTask> rows = careTaskMapper.selectList(
                new LambdaQueryWrapper<CareTask>()
                        .eq(CareTask::getSeverity, "medium")
                        .in(CareTask::getStatus, OPEN_STATUSES));

        Map<Long, Integer> byCounselor = new HashMap<>();
        for (CareTask t : rows) {
            if (t.getAssignedTo() == null) continue;
            byCounselor.merge(t.getAssignedTo(), 1, Integer::sum);
        }

        int notified = 0;
        for (Map.Entry<Long, Integer> e : byCounselor.entrySet()) {
            try {
                Map<String, Object> vars = new HashMap<>();
                vars.put("n", String.valueOf(e.getValue()));
                notificationOrchestrator.send(
                        CareNotifyPolicy.DAILY_DIGEST, "care_task", null,
                        RecipientContext.applicant(e.getKey()), vars);
                notified++;
            } catch (Exception ex) {
                log.warn("care digest send failed tenant={} counselor={}: {}",
                        tenantId, e.getKey(), ex.getMessage());
            }
        }
        if (notified > 0) {
            log.info("care daily digest tenant={} counselors={}", tenantId, notified);
        }
        return notified;
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
