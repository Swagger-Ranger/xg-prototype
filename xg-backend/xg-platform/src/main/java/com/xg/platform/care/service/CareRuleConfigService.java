package com.xg.platform.care.service;

import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.care.error.CareTaskErrorCode;
import com.xg.platform.care.mapper.CareEffectReportMapper;
import com.xg.platform.care.mapper.CareRuleConfigMapper;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.care.rule.RuleSpec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 规则运维（PRD §6.3 / §14.1）。P1 学校侧只能：启停单条内置规则、设全局严重度
 * 偏移、看 30 天效果报表 —— 不能改阈值 / DSL / 版本（那是产品方代码侧）。
 *
 * <p>启停 / 偏移结果回灌扫描链：{@link #disabledRuleIds()} 给 CareScanService 跳过，
 * {@link #effectiveSeverity(String)} 给 CareTaskRuleMatchService 钳位派生 severity+SLA。
 */
@Service
@RequiredArgsConstructor
public class CareRuleConfigService {

    /** 拒绝原因 code → 中文（镜像 RejectCareTaskRequest 枚举；报表不暴露英文 code）。 */
    private static final Map<String, String> REJECT_REASON_LABELS = Map.of(
            "rule_not_applicable", "规则不适用",
            "student_special_case", "学生特殊情况",
            "handled_offline", "已私下处理",
            "already_transferred", "已另行转介",
            "other", "其他");

    private final CareRuleConfigMapper configMapper;
    private final CareEffectReportMapper effectReportMapper;

    // ─────────────────── 扫描链回灌 ───────────────────

    /** 当前租户被显式停用的 ruleId 集合（无行=启用，不进集合）。 */
    public Set<String> disabledRuleIds() {
        Set<String> disabled = new HashSet<>();
        for (Map<String, Object> r : configMapper.listConfigs(TenantContext.getTenantId())) {
            if (Boolean.FALSE.equals(r.get("enabled"))) {
                disabled.add((String) r.get("rule_id"));
            }
        }
        return disabled;
    }

    /** 当前租户全局严重度偏移（无行=0）。 */
    public int severityOffset() {
        Integer v = configMapper.findSeverityOffset(TenantContext.getTenantId());
        return v == null ? 0 : v;
    }

    /** 基础 severity 经全局偏移钳位后的有效 severity（建任务 / 升级 / SLA 都用它）。 */
    public String effectiveSeverity(String baseSeverity) {
        return CareSeverity.applyOffset(baseSeverity, severityOffset());
    }

    // ─────────────────── 运维写 ───────────────────

    /** 启停单条规则。ruleId 必须是 catalog 内置规则，否则 404 文案。 */
    public void toggle(String ruleId, boolean enabled) {
        if (CareRuleCatalog.findById(ruleId).isEmpty()) {
            throw new BizException(CareTaskErrorCode.CARE_RULE_NOT_FOUND);
        }
        configMapper.upsertEnabled(TenantContext.getTenantId(), ruleId, enabled,
                CurrentUser.idOrNull());
    }

    /** 设全局严重度偏移（取值 -1/0/1 由 DTO bean validation 兜住）。 */
    public void setSeverityOffset(int offset) {
        configMapper.upsertSeverityOffset(TenantContext.getTenantId(), offset,
                CurrentUser.idOrNull());
    }

    // ─────────────────── 运维读 ───────────────────

    /** 规则列表 + 启停态 + 当前规则集版本 / 下次更新 / 当前偏移（PRD §6.3）。 */
    public Map<String, Object> listRules() {
        Set<String> disabled = disabledRuleIds();
        List<Map<String, Object>> rules = new ArrayList<>(CareRuleCatalog.RULES.size());
        for (RuleSpec s : CareRuleCatalog.RULES) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("rule_id", s.ruleId());
            r.put("name", s.name());
            r.put("category", s.category());
            r.put("severity", s.severity());
            r.put("enabled", !disabled.contains(s.ruleId()));
            rules.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rules", rules);
        out.put("severity_offset", severityOffset());
        out.put("rule_version", CareRuleCatalog.RULE_VERSION);
        out.put("next_update", CareRuleCatalog.NEXT_UPDATE);
        return out;
    }

    /** 30 天效果报表（PRD §14.1）：按规则触发数 / 接单率 / 完成率 / 平均闭环时长 /
     *  误报率 / 拒绝原因分布 + 治理提示。无数据的规则也出行（全 0），便于运维通览。 */
    public Map<String, Object> effectReport() {
        String tenantId = TenantContext.getTenantId();

        Map<String, Map<String, Object>> agg = indexByRule(
                effectReportMapper.aggregateByRule(tenantId));
        Map<String, Map<String, Object>> fp = indexByRule(
                effectReportMapper.falsePositiveByRule(tenantId));

        // rule_id → [{code,label,count}]
        Map<String, List<Map<String, Object>>> rejectByRule = new HashMap<>();
        for (Map<String, Object> row : effectReportMapper.rejectReasonByRule(tenantId)) {
            String rid = (String) row.get("rule_id");
            String code = (String) row.get("closed_reason");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", code);
            item.put("label", REJECT_REASON_LABELS.getOrDefault(code, code));
            item.put("count", asInt(row.get("cnt")));
            rejectByRule.computeIfAbsent(rid, k -> new ArrayList<>()).add(item);
        }

        List<Map<String, Object>> rules = new ArrayList<>(CareRuleCatalog.RULES.size());
        for (RuleSpec s : CareRuleCatalog.RULES) {
            Map<String, Object> a = agg.get(s.ruleId());
            int triggered30 = a == null ? 0 : asInt(a.get("triggered_30"));
            int accepted30 = a == null ? 0 : asInt(a.get("accepted_30"));
            int resolved30 = a == null ? 0 : asInt(a.get("resolved_30"));
            int handledOffline30 = a == null ? 0 : asInt(a.get("handled_offline_30"));
            int triggered60 = a == null ? 0 : asInt(a.get("triggered_60"));
            int accepted60 = a == null ? 0 : asInt(a.get("accepted_60"));
            double avgCloseHours = a == null ? 0d : asDouble(a.get("avg_close_hours_30"));
            int falsePositive30 = fp.containsKey(s.ruleId())
                    ? asInt(fp.get(s.ruleId()).get("false_positive_30")) : 0;

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("rule_id", s.ruleId());
            r.put("name", s.name());
            r.put("category", s.category());
            r.put("triggered", triggered30);
            r.put("accept_rate", ratio(accepted30, triggered30));
            r.put("resolve_rate", ratio(resolved30, triggered30));
            r.put("avg_close_hours", round2(avgCloseHours));
            r.put("false_positive_rate", ratio(falsePositive30, triggered30));
            r.put("reject_reasons", rejectByRule.getOrDefault(s.ruleId(), List.of()));
            r.put("hints", CareEffectGovernance.hints(triggered30, falsePositive30,
                    handledOffline30, triggered60, accepted60));
            rules.add(r);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("window_days", 30);
        out.put("rule_version", CareRuleCatalog.RULE_VERSION);
        out.put("rules", rules);
        return out;
    }

    // ─────────────────── helpers ───────────────────

    private static Map<String, Map<String, Object>> indexByRule(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> m = new HashMap<>();
        for (Map<String, Object> r : rows) {
            m.put((String) r.get("rule_id"), r);
        }
        return m;
    }

    /** 命中率，分母为 0 返回 0；保留 4 位小数，展示层再格式化。 */
    private static double ratio(int num, int den) {
        return den == 0 ? 0d : round4((double) num / den);
    }

    private static double round2(double v) {
        return Math.round(v * 100d) / 100d;
    }

    private static double round4(double v) {
        return Math.round(v * 10000d) / 10000d;
    }

    private static int asInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(o.toString());
    }

    private static double asDouble(Object o) {
        if (o == null) return 0d;
        if (o instanceof BigDecimal b) return b.doubleValue();
        if (o instanceof Number n) return n.doubleValue();
        return Double.parseDouble(o.toString());
    }
}
