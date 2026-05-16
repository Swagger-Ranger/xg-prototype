package com.xg.platform.care.scheduler;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.domain.CareTaskStatus;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.service.CareBriefResult;
import com.xg.platform.care.service.CareBriefService;
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
import java.util.List;

/**
 * AI brief 批量预生成（PRD §11.1）。三档：06:00 覆盖夜间规则扫描结果，
 * 08:00 / 13:00 增量覆盖上班前 / 上午新增。
 *
 * <p>多租户循环沿用 {@link CareScanScheduler} 模式：service 租户无关，本类
 * set/clear {@link TenantContext}（每档各自重复 tenant 遍历，与房内其它
 * scheduler 一致，不做共享抽象）。
 *
 * <p>「无有效 brief」判定 = {@code current_brief_id IS NULL}：W3.1 仅在
 * sanitize pass/redacted 时回填 current_brief_id，FAILED/BLOCKED 留空，
 * 故下一档天然重试 —— §11.1 的「增量 + 兜底」无需额外游标。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CareBriefScheduler {

    private final DataSource dataSource;
    private final CareTaskMapper careTaskMapper;
    private final CareBriefService careBriefService;

    @Scheduled(cron = "0 0 6 * * *")
    public void batch0600() {
        runOnce("batch_06");
    }

    @Scheduled(cron = "0 0 8 * * *")
    public void batch0800() {
        runOnce("batch_08");
    }

    @Scheduled(cron = "0 0 13 * * *")
    public void batch1300() {
        runOnce("batch_13");
    }

    public int runOnce(String trigger) {
        List<String[]> tenants = listActiveTenants();
        int totalGenerated = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(t[1]);
                totalGenerated += generateForTenant(tenantId, trigger);
            } catch (Exception e) {
                log.warn("care brief batch failed tenant={} trigger={}", tenantId, trigger, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("care brief batch [{}] tenants={} generated_total={}",
                trigger, tenants.size(), totalGenerated);
        return totalGenerated;
    }

    private int generateForTenant(String tenantId, String trigger) {
        // 非终态 + 无 current_brief + 24h 内到期；按 due_at 升序，
        // 批次中途失败也优先保证最紧急的任务先拿到 brief。
        List<CareTask> tasks = careTaskMapper.selectList(
                new LambdaQueryWrapper<CareTask>()
                        .isNull(CareTask::getCurrentBriefId)
                        .notIn(CareTask::getStatus,
                                CareTaskStatus.RESOLVED.getCode(),
                                CareTaskStatus.REJECTED.getCode(),
                                CareTaskStatus.TRANSFERRED.getCode())
                        .lt(CareTask::getDueAt, OffsetDateTime.now().plusHours(24))
                        .orderByAsc(CareTask::getDueAt));

        int generated = 0;
        for (CareTask task : tasks) {
            try {
                // generate 内部已按 §11.5 静默降级；这里只统计可展示结果
                CareBriefResult r = careBriefService.generate(task, trigger);
                if (r == CareBriefResult.GENERATED) {
                    generated++;
                }
            } catch (Exception e) {
                // 单任务异常不阻断整批（generate 自身已尽量不抛，这是兜底）
                log.warn("care brief gen failed taskId={} tenant={} trigger={}",
                        task.getId(), tenantId, trigger, e);
            }
        }
        if (!tasks.isEmpty()) {
            log.info("care brief batch tenant={} trigger={} candidates={} generated={}",
                    tenantId, trigger, tasks.size(), generated);
        }
        return generated;
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
