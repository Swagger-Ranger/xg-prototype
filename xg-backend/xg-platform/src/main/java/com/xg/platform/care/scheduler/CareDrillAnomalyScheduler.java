package com.xg.platform.care.scheduler;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareAdminQueryMapper;
import com.xg.platform.care.service.CareNotifyPolicy;
import com.xg.platform.care.service.CareWeekRange;
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
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 下钻访问异常审计周报（PRD §13.2）。每周一 09:00，多租户循环（沿用
 * {@link CareDailyDigestScheduler} 范式），向学工部部长推送本周下钻异常摘要，
 * <b>只推数量、不推全量日志、不含学生明细</b>。
 *
 * <p>两类异常：
 * <ul>
 *   <li>单周下钻 &gt; 自身近 4 周均值 ×3（且本周 ≥3，避免 0 基线噪声）</li>
 *   <li>近 30 天同一 (用户, 学生) 下钻 ≥5 次（高频盯人）</li>
 * </ul>
 *
 * <p>sourceId 传 null：聚合周报，去重唯一索引对 null 不生效（与
 * {@link CareDailyDigestScheduler} 同理，每周都发不被上周那条挡掉）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CareDrillAnomalyScheduler {

    private static final int SURGE_FLOOR = 3;       // 本周下钻达此数才参与放大判定
    private static final int HIGH_FREQ_MIN = 5;     // 30 天同生 ≥5 次
    private static final String DIRECTOR_ROLE = "student_affairs_director";

    private final DataSource dataSource;
    private final CareAdminQueryMapper adminMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    @Scheduled(cron = "0 0 9 * * MON")
    public void weekly() {
        runOnce();
    }

    public int runOnce() {
        OffsetDateTime now = OffsetDateTime.now();
        List<String[]> tenants = listActiveTenants();
        int totalTenantsNotified = 0;
        for (String[] tn : tenants) {
            try {
                TenantContext.setTenantId(tn[0]);
                TenantContext.setSchemaName(tn[1]);
                if (anomalyForTenant(tn[0], now)) {
                    totalTenantsNotified++;
                }
            } catch (Exception e) {
                log.warn("care drill anomaly failed tenant={}", tn[0], e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("care drill anomaly tenants={} notified={}", tenants.size(), totalTenantsNotified);
        return totalTenantsNotified;
    }

    /** @return 是否向该租户推送了异常摘要 */
    private boolean anomalyForTenant(String tenantId, OffsetDateTime now) {
        OffsetDateTime weekStart = CareWeekRange.weekStart(now);
        OffsetDateTime prior4Start = weekStart.minusDays(28);

        Map<Long, Integer> thisWeek = byActor(adminMapper.drillCountByActor(tenantId, weekStart, now));
        Map<Long, Integer> prior4 = byActor(
                adminMapper.drillCountByActor(tenantId, prior4Start, weekStart));

        int surge = 0;
        for (Map.Entry<Long, Integer> e : thisWeek.entrySet()) {
            int tw = e.getValue();
            double avg = prior4.getOrDefault(e.getKey(), 0) / 4.0;
            if (tw >= SURGE_FLOOR && tw > avg * 3) {
                surge++;
            }
        }

        int highFreq = adminMapper.drillHighFreqPairs(
                tenantId, now.minusDays(30), HIGH_FREQ_MIN).size();

        int n = surge + highFreq;
        if (n == 0) {
            return false;
        }

        List<Long> directors = adminMapper.roleHolderIds(tenantId, DIRECTOR_ROLE);
        for (Long directorId : directors) {
            try {
                notificationOrchestrator.send(
                        CareNotifyPolicy.DRILL_ANOMALY, "care_task", null,
                        RecipientContext.applicant(directorId),
                        Map.of("n", String.valueOf(n)));
            } catch (Exception ex) {
                log.warn("care drill anomaly send failed tenant={} director={}: {}",
                        tenantId, directorId, ex.getMessage());
            }
        }
        return !directors.isEmpty();
    }

    private static Map<Long, Integer> byActor(List<Map<String, Object>> rows) {
        Map<Long, Integer> m = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Object a = r.get("actor_id");
            if (a == null) continue;
            m.put(((Number) a).longValue(), ((Number) r.get("cnt")).intValue());
        }
        return m;
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
