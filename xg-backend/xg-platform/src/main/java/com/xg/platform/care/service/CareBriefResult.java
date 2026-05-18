package com.xg.platform.care.service;

/**
 * AI brief 生成结果。供刷新入口 / 调度器 / 测试断言。
 */
public enum CareBriefResult {
    /** 生成成功并已设为 current_brief（sanitize pass / redacted）*/
    GENERATED,
    /** sidecar 返回但 sanitize=blocked：存档留痕，不展示，不更 current_brief_id */
    BLOCKED,
    /** sidecar 不可用 / 超时 / 输出缺字段：§11.5 降级，无 history 行 */
    FAILED,
    /** manual_refresh 命中 5 分钟限流，未调用 sidecar */
    RATE_LIMITED
}
