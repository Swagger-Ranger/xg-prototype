package com.xg.business.metrics.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

import java.util.List;
import java.util.Map;

/**
 * NL 问数 endpoint 的入参。Sidecar 把老师的自然语言翻译成结构化 metric_id +
 * 维度/过滤/对比。LLM **绝不**输出 SQL — 它选 metric_id 枚举,后端跑写死的 SQL。
 *
 * <p>角色 scope 在 service 层强注入,不接受前端传 college_id 绕过(防越权)。
 */
@Getter
@Setter
public class MetricQueryRequest {

    /**
     * 必填。MetricId 枚举字符串值,如 "leave.count" / "leave.pass_rate"。
     * 不在枚举内 → 400 INVALID_METRIC。
     */
    @NotBlank
    private String metric;

    /**
     * 切片维度。每个 metric 有白名单(college / class / month / leave_type / status …)。
     * 维度不在白名单 → 400 INVALID_DIMENSION,不静默丢。
     */
    private List<String> dimensions;

    /**
     * 等值过滤。允许 key 由每个 metric 自定义(term_code / leave_type / status / college_id …)。
     * 院长视角下,即使前端塞 college_id 也会被 scope resolver 覆盖成自己的。
     */
    private Map<String, Object> filters;

    /**
     * 时间对比模式:
     *  - null / "none" — 不对比,只算当前窗口
     *  - "last_period" — 跟上一相同长度时段对比(本月 vs 上月,本周 vs 上周)
     *  - "yoy"          — 同比,跟去年同期对比(本学期 vs 去年同学期)
     */
    private String compareTo;
}
