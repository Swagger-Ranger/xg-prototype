package com.xg.platform.alert.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageResult;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.alert.dto.AlertQueryRequest;
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
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudentAlertService {

    private final AlertRuleMapper alertRuleMapper;
    private final StudentAlertMapper studentAlertMapper;

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
            default -> 0;
        };
    }

    private int evalFrequency(AlertRule rule, Map<String, Object> cfg) {
        String eventType = (String) cfg.get("event_type");
        int windowDays = toInt(cfg.get("window_days"), 30);
        int threshold = toInt(cfg.get("threshold"), 5);
        List<Map<String, Object>> rows = studentAlertMapper.findFrequencyCandidates(eventType, windowDays, threshold);
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            Long studentId = toLong(row.get("student_id"));
            long cnt = toLong(row.get("cnt"));
            Map<String, Object> trigger = new HashMap<>();
            trigger.put("event_type", eventType);
            trigger.put("window_days", windowDays);
            trigger.put("threshold", threshold);
            trigger.put("actual_count", cnt);
            if (insertIfAbsent(rule, studentId, trigger)) inserted++;
        }
        return inserted;
    }

    @SuppressWarnings("unchecked")
    private int evalComposite(AlertRule rule, Map<String, Object> cfg) {
        List<String> eventTypes = (List<String>) cfg.get("event_types");
        int windowDays = toInt(cfg.get("window_days"), 30);
        int distinctThreshold = toInt(cfg.get("distinct_threshold"), 3);
        if (eventTypes == null || eventTypes.isEmpty()) return 0;
        List<Map<String, Object>> rows = studentAlertMapper.findCompositeCandidates(eventTypes, windowDays, distinctThreshold);
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            Long studentId = toLong(row.get("student_id"));
            long distinctCnt = toLong(row.get("distinct_cnt"));
            Object types = row.get("types");
            Map<String, Object> trigger = new HashMap<>();
            trigger.put("window_days", windowDays);
            trigger.put("distinct_threshold", distinctThreshold);
            trigger.put("distinct_count", distinctCnt);
            trigger.put("matched_types", types);
            if (insertIfAbsent(rule, studentId, trigger)) inserted++;
        }
        return inserted;
    }

    private boolean insertIfAbsent(AlertRule rule, Long studentId, Map<String, Object> triggerData) {
        Long existing = studentAlertMapper.selectCount(
                new LambdaQueryWrapper<StudentAlert>()
                        .eq(StudentAlert::getStudentId, studentId)
                        .eq(StudentAlert::getAlertRuleId, rule.getId())
                        .eq(StudentAlert::getStatus, "open"));
        if (existing != null && existing > 0) return false;
        StudentAlert alert = new StudentAlert();
        alert.setTenantId(TenantContext.getTenantId());
        alert.setStudentId(studentId);
        alert.setAlertRuleId(rule.getId());
        alert.setRuleName(rule.getName());
        alert.setSeverity(rule.getSeverity());
        alert.setTriggerData(triggerData);
        alert.setStatus("open");
        alert.setCreatedAt(OffsetDateTime.now());
        alert.setUpdatedAt(OffsetDateTime.now());
        studentAlertMapper.insert(alert);
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
