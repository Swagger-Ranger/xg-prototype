package com.xg.platform.care.service;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareBriefQueryMapper;
import com.xg.platform.care.model.CareTask;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 组装送往 AI sidecar 的上下文。<b>PRD §11.2 输入安全靠"按构造"</b>：
 * 这里只放允许字段，禁止字段（心理 / 医疗 / 家庭 / 资助 / 身份证 / 谈话原文）
 * 根本不进 map，不出网 —— 不靠 sidecar 自觉过滤。
 */
@Component
@RequiredArgsConstructor
public class CareBriefContextBuilder {

    private static final int RECENT_EVENT_WINDOW_DAYS = 30;

    private final CareBriefQueryMapper queryMapper;

    public Map<String, Object> build(CareTask task) {
        String tenantId = TenantContext.getTenantId();
        Long studentId = task.getStudentId();
        OffsetDateTime since = OffsetDateTime.now().minusDays(RECENT_EVENT_WINDOW_DAYS);

        Map<String, Object> ctx = new HashMap<>();
        // 触发证据：规则命中快照，本就是结构化、无敏感自由文本
        ctx.put("trigger", task.getTriggerData() == null ? Map.of() : task.getTriggerData());
        ctx.put("rule_id", task.getRuleId());
        ctx.put("severity", task.getSeverity());

        Map<String, Object> student = queryMapper.studentBasicInfo(tenantId, studentId);
        ctx.put("student", student == null ? Map.of() : student);

        List<Map<String, Object>> events =
                queryMapper.recentStructuredEvents(tenantId, studentId, since);
        ctx.put("recent_events", events);
        ctx.put("recent_window_days", RECENT_EVENT_WINDOW_DAYS);

        List<Map<String, Object>> closed = queryMapper.closedCareSummary(tenantId, studentId);
        ctx.put("closed_care_summary", closed);

        return ctx;
    }
}
