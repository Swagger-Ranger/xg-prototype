package com.xg.platform.alert.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.base.PageResult;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.alert.dsl.AlertRuleDsl;
import com.xg.platform.alert.dto.AlertQueryRequest;
import com.xg.platform.alert.engine.AlertRuleEngine;
import com.xg.platform.alert.mapper.AlertRuleMapper;
import com.xg.platform.alert.mapper.StudentAlertMapper;
import com.xg.platform.alert.model.AlertRule;
import com.xg.platform.alert.model.StudentAlert;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudentAlertService {

    private static final int SAMPLE_EVENT_LIMIT = 8;

    private final AlertRuleMapper alertRuleMapper;
    private final StudentAlertMapper studentAlertMapper;
    private final AlertRuleEngine alertRuleEngine;
    private final EventSummaryFormatter eventSummaryFormatter;
    private final ObjectMapper objectMapper;

    /**
     * Scan all enabled rules in the current tenant and insert alerts for matching students.
     * Dedup: (student_id, alert_rule_id) with status=open — skip if already open.
     */
    public int scanCurrentTenant() {
        List<AlertRule> rules = alertRuleMapper.selectList(
                new LambdaQueryWrapper<AlertRule>().eq(AlertRule::getEnabled, true));
        int inserted = 0;
        for (AlertRule rule : rules) {
            try {
                inserted += evaluateRule(rule);
            } catch (Exception e) {
                log.warn("alert rule evaluation failed id={} name={}", rule.getId(), rule.getName(), e);
            }
        }
        return inserted;
    }

    private int evaluateRule(AlertRule rule) {
        Map<String, Object> cfg = rule.getConfig();
        if (cfg == null) return 0;
        return switch (rule.getRuleType()) {
            case "frequency" -> evalFrequency(rule, cfg);
            case "composite" -> evalComposite(rule, cfg);
            case "dsl" -> evalDsl(rule, cfg);
            default -> 0;
        };
    }

    private int evalDsl(AlertRule rule, Map<String, Object> cfg) {
        AlertRuleDsl dsl = objectMapper.convertValue(cfg, AlertRuleDsl.class);
        int cooldownDays = dsl.cooldownDays() == null ? 0 : dsl.cooldownDays();
        List<AlertRuleEngine.Match> matches = alertRuleEngine.evaluate(dsl);
        int inserted = 0;
        for (AlertRuleEngine.Match m : matches) {
            Map<String, Object> trigger = new HashMap<>();
            trigger.put("rule_name", dsl.name());
            trigger.put("condition", dsl.condition());
            trigger.put("window", dsl.window());
            trigger.put("values", m.values());
            String sev = resolveSeverity(rule, dsl, m.values());
            if (insertIfAbsentWithSeverity(rule, m.studentId(), trigger, cooldownDays, sev)) inserted++;
        }
        return inserted;
    }

    /**
     * DSL severity is Integer (0-10); AlertRule/StudentAlert.severity is the String label used
     * everywhere else (dashboards, notifications). Precedence: AI hook override > DSL severity
     * (mapped to label) > AlertRule column severity.
     */
    private static String resolveSeverity(AlertRule rule, AlertRuleDsl dsl, Map<String, Object> values) {
        Object aiSev = values == null ? null : values.get("_ai_severity");
        if (aiSev instanceof Number n) return severityLabel(n.intValue());
        if (dsl.severity() != null) return severityLabel(dsl.severity());
        return rule.getSeverity();
    }

    static String severityLabel(int s) {
        if (s >= 9) return "critical";
        if (s >= 7) return "high";
        if (s >= 4) return "medium";
        if (s >= 1) return "low";
        return "info";
    }

    private boolean insertIfAbsentWithSeverity(AlertRule rule, Long studentId, Map<String, Object> triggerData,
                                               int cooldownDays, String severityOverride) {
        String sev = severityOverride != null ? severityOverride : rule.getSeverity();
        return upsertAlert(rule, studentId, triggerData, cooldownDays, sev);
    }

    private int evalFrequency(AlertRule rule, Map<String, Object> cfg) {
        String eventType = (String) cfg.get("event_type");
        int windowDays = toInt(cfg.get("window_days"), 30);
        int threshold = toInt(cfg.get("threshold"), 5);
        int cooldownDays = toInt(cfg.get("cooldown_days"), 0);
        List<Map<String, Object>> rows = studentAlertMapper.findFrequencyCandidates(eventType, windowDays, threshold);
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            Long studentId = toLong(row.get("student_id"));
            long cnt = toLong(row.get("cnt"));
            Map<String, Object> trigger = new LinkedHashMap<>();
            trigger.put("event_type", eventType);
            trigger.put("window_days", windowDays);
            trigger.put("threshold", threshold);
            trigger.put("actual_count", cnt);
            List<Map<String, Object>> samples = studentAlertMapper.findRecentEventsByType(
                    studentId, eventType, windowDays, SAMPLE_EVENT_LIMIT);
            trigger.put("matched_events", toMatchedEvents(samples));
            String typeLabel = eventTypeLabel(eventType);
            trigger.put("explanation", String.format("近 %d 天累计%s %d 次，已超过阈值 %d 次。",
                    windowDays, typeLabel, cnt, threshold));
            trigger.put("rule_hit", String.format("近 %d 天 %s 事件 ≥ %d 次", windowDays, typeLabel, threshold));
            if (insertIfAbsent(rule, studentId, trigger, cooldownDays)) inserted++;
        }
        return inserted;
    }

    @SuppressWarnings("unchecked")
    private int evalComposite(AlertRule rule, Map<String, Object> cfg) {
        List<String> eventTypes = (List<String>) cfg.get("event_types");
        int windowDays = toInt(cfg.get("window_days"), 30);
        int distinctThreshold = toInt(cfg.get("distinct_threshold"), 3);
        int perTypeThreshold = toInt(cfg.get("per_type_threshold"), 1);
        int cooldownDays = toInt(cfg.get("cooldown_days"), 0);
        if (eventTypes == null || eventTypes.isEmpty()) return 0;
        List<Map<String, Object>> rows = studentAlertMapper.findCompositeCandidates(
                eventTypes, windowDays, distinctThreshold, perTypeThreshold);
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            Long studentId = toLong(row.get("student_id"));
            long distinctCnt = toLong(row.get("distinct_cnt"));
            Object types = row.get("types");
            Map<String, Object> trigger = new LinkedHashMap<>();
            trigger.put("window_days", windowDays);
            trigger.put("distinct_threshold", distinctThreshold);
            trigger.put("per_type_threshold", perTypeThreshold);
            trigger.put("distinct_count", distinctCnt);
            trigger.put("matched_types", types);
            List<Map<String, Object>> samples = studentAlertMapper.findRecentEventsByTypes(
                    studentId, eventTypes, windowDays, SAMPLE_EVENT_LIMIT);
            trigger.put("matched_events", toMatchedEvents(samples));
            String typeDisplay = joinTypeLabels(typesToList(types));
            trigger.put("explanation", String.format("近 %d 天命中 %d 种异常事件（%s），已达多模块异常阈值。",
                    windowDays, distinctCnt, typeDisplay));
            trigger.put("rule_hit", String.format("近 %d 天 命中事件类型 ≥ %d 种", windowDays, distinctThreshold));
            if (insertIfAbsent(rule, studentId, trigger, cooldownDays)) inserted++;
        }
        return inserted;
    }

    private List<Map<String, Object>> toMatchedEvents(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            String eventType = (String) row.get("event_type");
            Map<String, Object> eventData = parseEventData(row.get("event_data"));
            Object occ = row.get("occurred_at");
            OffsetDateTime occurred = (occ instanceof OffsetDateTime o) ? o
                    : (occ instanceof java.sql.Timestamp ts) ? ts.toInstant().atOffset(OffsetDateTime.now().getOffset())
                    : null;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", row.get("id"));
            e.put("event_type", eventType);
            e.put("occurred_at", occurred == null ? null : occurred.toString());
            e.put("summary", eventSummaryFormatter.format(eventType, eventData, occurred));
            out.add(e);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseEventData(Object raw) {
        if (raw == null) return Map.of();
        if (raw instanceof Map<?, ?> m) return (Map<String, Object>) m;
        try {
            return objectMapper.readValue(raw.toString(), Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static List<String> typesToList(Object types) {
        if (types == null) return List.of();
        if (types instanceof java.sql.Array arr) {
            try {
                Object[] els = (Object[]) arr.getArray();
                List<String> out = new ArrayList<>(els.length);
                for (Object el : els) out.add(String.valueOf(el));
                return out;
            } catch (Exception e) { return List.of(); }
        }
        if (types instanceof List<?> l) {
            List<String> out = new ArrayList<>(l.size());
            for (Object el : l) out.add(String.valueOf(el));
            return out;
        }
        if (types instanceof Object[] els) {
            List<String> out = new ArrayList<>(els.length);
            for (Object el : els) out.add(String.valueOf(el));
            return out;
        }
        return List.of();
    }

    private static String joinTypeLabels(List<String> types) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < types.size(); i++) {
            if (i > 0) sb.append("、");
            sb.append(eventTypeLabel(types.get(i)));
        }
        return sb.toString();
    }

    private static String eventTypeLabel(String t) {
        return switch (t) {
            case "leave_submit" -> "请假";
            case "violation_recorded" -> "违纪";
            case "checkin_late" -> "迟到";
            case "checkin_absent" -> "缺勤";
            case "grade_fail" -> "课程不及格";
            case "dormitory_violation" -> "宿舍违规";
            default -> t;
        };
    }

    private boolean insertIfAbsent(AlertRule rule, Long studentId, Map<String, Object> triggerData, int cooldownDays) {
        return upsertAlert(rule, studentId, triggerData, cooldownDays, rule.getSeverity());
    }

    /**
     * Noise-governance aware insert/update:
     *   open / false_positive / muted → skip (don't fire again)
     *   acknowledged                  → re-fire: pull status back to open, append
     *                                     to trigger_data.re_fires[] so counselor
     *                                     sees new evidence without losing history
     *   resolved within cooldown      → skip
     *   otherwise                     → insert fresh alert
     *
     * Returns true if this call produced a new row or re-activated an existing one;
     * counters in the scan summary treat both as "inserted" for ops visibility.
     */
    private boolean upsertAlert(AlertRule rule, Long studentId, Map<String, Object> triggerData,
                                int cooldownDays, String severity) {
        List<StudentAlert> existing = studentAlertMapper.selectList(
                new LambdaQueryWrapper<StudentAlert>()
                        .eq(StudentAlert::getStudentId, studentId)
                        .eq(StudentAlert::getAlertRuleId, rule.getId())
                        .in(StudentAlert::getStatus, List.of("open", "acknowledged", "false_positive"))
                        .orderByDesc(StudentAlert::getCreatedAt));
        OffsetDateTime now = OffsetDateTime.now();
        for (StudentAlert existingAlert : existing) {
            if ("false_positive".equals(existingAlert.getStatus())) {
                return false;
            }
            if (existingAlert.getMutedUntil() != null && existingAlert.getMutedUntil().isAfter(now)) {
                return false;
            }
            if ("open".equals(existingAlert.getStatus())) {
                return false;
            }
            if ("acknowledged".equals(existingAlert.getStatus())) {
                return refireAcknowledged(existingAlert, triggerData, severity, now);
            }
        }
        if (cooldownDays > 0 && studentAlertMapper.hasRecentResolved(studentId, rule.getId(), cooldownDays)) {
            return false;
        }
        StudentAlert alert = new StudentAlert();
        alert.setTenantId(TenantContext.getTenantId());
        alert.setStudentId(studentId);
        alert.setAlertRuleId(rule.getId());
        alert.setRuleName(rule.getName());
        alert.setSeverity(severity);
        alert.setTriggerData(triggerData);
        alert.setStatus("open");
        alert.setCreatedAt(now);
        alert.setUpdatedAt(now);
        studentAlertMapper.insert(alert);
        return true;
    }

    @SuppressWarnings("unchecked")
    private boolean refireAcknowledged(StudentAlert existing, Map<String, Object> freshTrigger,
                                       String severity, OffsetDateTime now) {
        Map<String, Object> prev = existing.getTriggerData();
        if (prev == null) prev = new LinkedHashMap<>();

        Object prevCountObj = prev.get("actual_count");
        Object freshCountObj = freshTrigger.get("actual_count");
        long prevCount = prevCountObj instanceof Number n ? n.longValue() : 0L;
        long freshCount = freshCountObj instanceof Number n ? n.longValue() : 0L;
        if (freshCountObj != null && freshCount <= prevCount) {
            return false;
        }

        Map<String, Object> merged = new LinkedHashMap<>(freshTrigger);
        List<Map<String, Object>> history;
        Object existingReFires = prev.get("re_fires");
        if (existingReFires instanceof List<?> l) {
            history = new ArrayList<>((List<Map<String, Object>>) l);
        } else {
            history = new ArrayList<>();
        }
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("re_fired_at", now.toString());
        event.put("previous_acknowledged_at",
                existing.getAcknowledgedAt() == null ? null : existing.getAcknowledgedAt().toString());
        event.put("previous_acknowledged_by", existing.getAcknowledgedBy());
        event.put("previous_count", prevCount);
        event.put("new_count", freshCount);
        history.add(event);
        merged.put("re_fires", history);

        existing.setStatus("open");
        existing.setAcknowledgedBy(null);
        existing.setAcknowledgedAt(null);
        existing.setSeverity(severity);
        existing.setTriggerData(merged);
        existing.setUpdatedAt(now);
        studentAlertMapper.updateById(existing);
        return true;
    }

    public PageResult<StudentAlert> list(AlertQueryRequest query) {
        Page<StudentAlert> page = query.toPage();
        LambdaQueryWrapper<StudentAlert> wrapper = new LambdaQueryWrapper<StudentAlert>()
                .eq(query.getStatus() != null, StudentAlert::getStatus, query.getStatus())
                .eq(query.getSeverity() != null, StudentAlert::getSeverity, query.getSeverity())
                .eq(query.getStudentId() != null, StudentAlert::getStudentId, query.getStudentId())
                .orderByDesc(StudentAlert::getCreatedAt);
        return PageResult.of(studentAlertMapper.selectPage(page, wrapper));
    }

    public Map<String, Object> summary() {
        List<StudentAlert> openAlerts = studentAlertMapper.selectList(
                new LambdaQueryWrapper<StudentAlert>().eq(StudentAlert::getStatus, "open"));
        Map<String, Long> bySeverity = new HashMap<>();
        for (StudentAlert a : openAlerts) {
            bySeverity.merge(a.getSeverity(), 1L, Long::sum);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("open_total", (long) openAlerts.size());
        result.put("by_severity", bySeverity);
        return result;
    }

    public StudentAlert detail(Long id) {
        return studentAlertMapper.selectById(id);
    }

    public void acknowledge(Long id, Long userId, String note) {
        StudentAlert alert = studentAlertMapper.selectById(id);
        if (alert == null || !"open".equals(alert.getStatus())) return;
        alert.setStatus("acknowledged");
        alert.setAcknowledgedBy(userId);
        alert.setAcknowledgedAt(OffsetDateTime.now());
        alert.setNote(note);
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.updateById(alert);
    }

    public void resolve(Long id, Long userId, String note) {
        StudentAlert alert = studentAlertMapper.selectById(id);
        if (alert == null || "resolved".equals(alert.getStatus())) return;
        alert.setStatus("resolved");
        if (alert.getAcknowledgedAt() == null) {
            alert.setAcknowledgedBy(userId);
            alert.setAcknowledgedAt(OffsetDateTime.now());
        }
        alert.setResolvedAt(OffsetDateTime.now());
        if (note != null) alert.setNote(note);
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.updateById(alert);
    }

    /**
     * Mute an alert for {@code days} starting now. While {@code muted_until} is in the
     * future the scan engine skips both new inserts and re-fires for this (student, rule)
     * pair — gives counselors a "not now, check back later" lever without closing the
     * incident or marking it false positive.
     */
    public void mute(Long id, Long userId, int days, String note) {
        if (days <= 0) return;
        StudentAlert alert = studentAlertMapper.selectById(id);
        if (alert == null) return;
        alert.setMutedUntil(OffsetDateTime.now().plusDays(days));
        if (alert.getAcknowledgedAt() == null) {
            alert.setAcknowledgedBy(userId);
            alert.setAcknowledgedAt(OffsetDateTime.now());
            alert.setStatus("acknowledged");
        }
        if (note != null) alert.setNote(note);
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.updateById(alert);
    }

    /**
     * Called by counselor_talk when a talk is saved with source_alert_id set. Writes the
     * back-link and auto-acknowledges the alert — mid-tier integration per design: we
     * record that a conversation happened but do not close the incident (counselor still
     * decides when to resolve).
     */
    public void linkCounselorTalk(Long alertId, Long talkId, Long counselorId) {
        StudentAlert alert = studentAlertMapper.selectById(alertId);
        if (alert == null) return;
        alert.setCounselorTalkId(talkId);
        if ("open".equals(alert.getStatus())) {
            alert.setStatus("acknowledged");
            alert.setAcknowledgedBy(counselorId);
            alert.setAcknowledgedAt(OffsetDateTime.now());
        }
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.updateById(alert);
    }

    /**
     * Flip an alert to {@code false_positive}. Unlike resolve, this does not set
     * resolved_at — false positives are an ops signal, not a closed incident. The
     * rule stats view counts them separately and feeds a false-positive-rate metric.
     */
    public void markFalsePositive(Long id, Long userId, String note) {
        StudentAlert alert = studentAlertMapper.selectById(id);
        if (alert == null || "false_positive".equals(alert.getStatus())) return;
        alert.setStatus("false_positive");
        if (alert.getAcknowledgedAt() == null) {
            alert.setAcknowledgedBy(userId);
            alert.setAcknowledgedAt(OffsetDateTime.now());
        }
        if (note != null) alert.setNote(note);
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.updateById(alert);
    }

    /**
     * List all rules plus their 30-day operations stats. The frontend rules admin page
     * shows fires / ack rate / false-positive rate / avg-ack-time / last-fired so
     * counselors can see which rules are noisy or stale.
     */
    public List<Map<String, Object>> listRulesWithStats(int windowDays) {
        List<AlertRule> rules = alertRuleMapper.selectList(null);
        Map<Long, Map<String, Object>> statsByRule = new HashMap<>();
        for (Map<String, Object> row : studentAlertMapper.aggregateRuleStats(windowDays)) {
            statsByRule.put(toLong(row.get("alert_rule_id")), row);
        }
        List<Map<String, Object>> out = new ArrayList<>(rules.size());
        for (AlertRule r : rules) {
            Map<String, Object> stats = statsByRule.getOrDefault(r.getId(), Map.of());
            long fires = toLong(stats.get("fires"));
            long falsePositives = toLong(stats.get("false_positives"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", r.getId());
            item.put("name", r.getName());
            item.put("description", r.getDescription());
            item.put("rule_type", r.getRuleType());
            item.put("severity", r.getSeverity());
            item.put("enabled", r.getEnabled());
            item.put("fires", fires);
            item.put("acked", toLong(stats.get("acked")));
            item.put("resolved", toLong(stats.get("resolved")));
            item.put("false_positives", falsePositives);
            item.put("false_positive_rate", fires == 0 ? 0.0 : (double) falsePositives / (double) fires);
            item.put("avg_ack_minutes", stats.get("avg_ack_minutes"));
            item.put("last_fired_at", stats.get("last_fired_at"));
            out.add(item);
        }
        return out;
    }

    private static int toInt(Object o, int fallback) {
        if (o == null) return fallback;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return fallback; }
    }

    private static long toLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return 0L; }
    }
}
