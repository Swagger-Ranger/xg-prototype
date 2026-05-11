package com.xg.business.metrics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * NL 问数 endpoint 出参。结构化数据 + 给前端的渲染提示;前端按 chartType 选 Echarts
 * 图或 Antd 数字卡。LLM 拿到这份 response 后再生成中文 narrative 写到 AI 卡上方。
 */
@Data
@Builder
@AllArgsConstructor
public class MetricQueryResponse {

    /** 回显 metric_id,前端可用作 cache key。 */
    private String metric;

    /**
     * 渲染提示:
     *  - "number"  — 单一数字(Statistic)。rows 长度 1,字段 value。
     *  - "line"    — 折线图(时间 x 数值)。rows 含 x(时间标签)+ value [+ compare_value 同期]。
     *  - "bar"     — 柱状图(分类对比)。rows 含 label + value。
     *  - "topN"    — Top N 表格(人/班级/学院 排行)。rows 含 label + value [+ extra fields]。
     */
    private String chartType;

    /**
     * 结构化数据行。每行是一个 Map(JSON 自然友好),字段名跟 chartType 约定:
     *  - number   → {"value": 42}
     *  - line     → {"x": "2026-W18", "value": 12, "compare_value": 8}
     *  - bar/topN → {"label": "公假", "value": 8, ...其他维度字段}
     */
    private List<Map<String, Object>> rows;

    /**
     * 数据上下文(scope hint),让 LLM narrative 知道这是"本学院" 还是"全校",时间范围多长。
     * 例:{"scope":"college","college_name":"计算机学院","term":"2025-2026 学年第二学期","since":"2026-02-01","until":"2026-05-11"}
     */
    private Map<String, Object> context;

    /**
     * 同比/环比时,这里返回对比期的同口径数字。null = 不对比。
     * 例:{"value":34, "delta":8, "delta_pct":23.5, "period":"上学期"}
     */
    private Map<String, Object> comparison;
}
