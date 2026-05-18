package com.xg.platform.care.rule;

import java.util.Map;

/**
 * 一条规则在某学生身上命中的结果。
 * triggerData 进 care_task.trigger_data（证据快照，独立于 student_event_log）。
 */
public record RuleHit(Long studentId, String summary, Map<String, Object> triggerData) {
}
