package com.xg.platform.care.service;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.care.rule.RuleHit;
import com.xg.platform.care.rule.RuleSpec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 扫当前租户全部内置规则，把命中交给 {@link CareTaskRuleMatchService} 决定 create/merge/suppress。
 *
 * <p>本类只做编排：evaluate → upsert。去重 / 冷却 / 派单 / 严重度升级全在 upsert 里，
 * 不再有独立的 countRecentTask 跳过逻辑（那套在任务长期未关闭时会漏建第二条）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareScanService {

    private final CareRuleEngine ruleEngine;
    private final CareTaskRuleMatchService ruleMatchService;

    /**
     * 扫当前租户全部规则，返回新建任务数（仅计 CREATED；merge/suppress 不计）。
     * 不加 @Transactional：每条规则独立 try-catch，单条挂掉不回滚其它规则；
     * 每个 hit 的 upsert 自身是独立事务。
     */
    public int scanCurrentTenant() {
        int created = 0;
        for (RuleSpec spec : CareRuleCatalog.RULES) {
            try {
                List<RuleHit> hits = ruleEngine.evaluate(spec);
                for (RuleHit hit : hits) {
                    if (ruleMatchService.upsert(spec, hit) == CareTaskUpsertResult.CREATED) {
                        created++;
                    }
                }
            } catch (Exception e) {
                log.warn("care rule eval failed rule={} tenant={}",
                        spec.ruleId(), TenantContext.getTenantId(), e);
            }
        }
        return created;
    }
}
