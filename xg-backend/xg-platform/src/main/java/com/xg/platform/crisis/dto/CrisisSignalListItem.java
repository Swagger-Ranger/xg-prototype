package com.xg.platform.crisis.dto;

import java.time.OffsetDateTime;

/**
 * 工作台「危机·需立即人工核实」泳道列表项（设计 §4 / 区一摘要）。
 *
 * <p>只放辅导员判断「要不要点进去」所需的最小字段，全部纯 DB（零 AI）。
 * 项目全局 Jackson SNAKE_CASE → record 组件 camelCase 自动转 snake_case 出参。
 */
public record CrisisSignalListItem(
        Long signalId,
        Long studentId,
        String studentName,
        String className,
        OffsetDateTime createdAt,
        String status,
        String notifyStatus) {
}
