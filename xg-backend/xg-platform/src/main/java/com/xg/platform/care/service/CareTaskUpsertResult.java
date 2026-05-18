package com.xg.platform.care.service;

/**
 * 规则命中 → care_task 的处理结果。用于扫描器计数与后续测试断言。
 */
public enum CareTaskUpsertResult {
    /** 新建了一条任务 */
    CREATED,
    /** 合并进已有 open 任务（证据追加或严重度升级，审计区分）*/
    MERGED,
    /** 冷却期内被抑制，未建任务 */
    SUPPRESSED,
    /** 解析不到责任辅导员，跳过（assigned_to NOT NULL）*/
    SKIPPED_NO_ASSIGNEE
}
