package com.xg.platform.care.service;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareRuleQueryMapper;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.care.rule.RuleHit;
import com.xg.platform.care.rule.RuleSpec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 评估当前租户下所有内置规则，产出命中。纯读，不落库 —— 落库 / 去重 / 派单由 CareScanService 接力。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareRuleEngine {

    private final CareRuleQueryMapper queryMapper;

    /** 评估单条规则，返回命中列表（当前租户）。 */
    public List<RuleHit> evaluate(RuleSpec spec) {
        String tenantId = TenantContext.getTenantId();
        OffsetDateTime since = OffsetDateTime.now().minusDays(spec.windowDays());

        return switch (spec.evalKind()) {
            case COUNT_THRESHOLD -> evalCountThreshold(spec, tenantId, since);
            case MULTI_CATEGORY -> evalMultiCategory(spec, tenantId, since);
            case NO_FOLLOWUP_WITH_HISTORY -> evalNoFollowup(spec, tenantId, since);
        };
    }

    private List<RuleHit> evalCountThreshold(RuleSpec spec, String tenantId, OffsetDateTime since) {
        List<Map<String, Object>> rows = queryMapper.countByEventTypes(
                tenantId, since, spec.eventTypes(), spec.minCount(),
                spec.severityMin(), spec.severityMax());
        List<RuleHit> hits = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Long studentId = asLong(r.get("student_id"));
            int cnt = asInt(r.get("cnt"));
            Map<String, Object> td = baseTriggerData(spec);
            td.put("matched_count", cnt);
            td.put("threshold", spec.minCount());
            hits.add(new RuleHit(studentId,
                    buildSummary(spec, cnt), td));
        }
        return hits;
    }

    private List<RuleHit> evalMultiCategory(RuleSpec spec, String tenantId, OffsetDateTime since) {
        int sevMin = spec.severityMin() == null ? 0 : spec.severityMin();
        List<Map<String, Object>> rows = queryMapper.countDistinctSources(
                tenantId, since, spec.minCount(), sevMin);
        List<RuleHit> hits = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Long studentId = asLong(r.get("student_id"));
            int cnt = asInt(r.get("cnt"));
            Map<String, Object> td = baseTriggerData(spec);
            td.put("distinct_categories", cnt);
            td.put("threshold", spec.minCount());
            hits.add(new RuleHit(studentId,
                    "近 " + spec.windowDays() + " 天有 " + cnt + " 类异常表现", td));
        }
        return hits;
    }

    private List<RuleHit> evalNoFollowup(RuleSpec spec, String tenantId, OffsetDateTime since) {
        List<Long> studentIds = queryMapper.studentsWithHistoryNoFollowup(tenantId, since);
        List<RuleHit> hits = new ArrayList<>(studentIds.size());
        for (Long studentId : studentIds) {
            Map<String, Object> td = baseTriggerData(spec);
            td.put("no_talk_days", spec.windowDays());
            hits.add(new RuleHit(studentId,
                    "近 " + spec.windowDays() + " 天未见跟进记录", td));
        }
        return hits;
    }

    private static Map<String, Object> baseTriggerData(RuleSpec spec) {
        Map<String, Object> td = new HashMap<>();
        td.put("rule_id", spec.ruleId());
        td.put("rule_name", spec.name());
        td.put("category", spec.category());
        td.put("window_days", spec.windowDays());
        td.put("rule_version", CareRuleCatalog.RULE_VERSION);
        return td;
    }

    private static String buildSummary(RuleSpec spec, int cnt) {
        return switch (spec.ruleId()) {
            case "R001" -> "近 " + spec.windowDays() + " 天该同学有 " + cnt + " 次课堂缺勤";
            case "R006" -> "近 " + spec.windowDays() + " 天有 " + cnt + " 次违纪记录";
            case "R007" -> "请假已超期未销假";
            case "R011a" -> "近 " + spec.windowDays() + " 天出现纪律类离岗";
            case "R011b" -> "近 " + spec.windowDays() + " 天出现表现类离岗";
            case "R012" -> "近 " + spec.windowDays() + " 天勤工申请被拒 " + cnt + " 次，未成功上岗";
            default -> spec.name();
        };
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Long l) return l;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    private static int asInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(o.toString());
    }
}
