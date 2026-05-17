package com.xg.platform.care.service;

import java.util.Optional;

/**
 * 关怀通知模板路由策略（PRD §12.2 / §12.3）。集中"严重度 → 模板 code"，
 * 避免散在创建逻辑与调度器里。模板本身（文案 / 渠道 / 静默）落库可由通知中心改，
 * 这里只决定"触发哪个 code"。
 *
 * <p>渠道差异（critical 仅站内、high 企微+站内）由模板 default_channels 表达，
 * 业务侧不关心渠道，只选 code。
 */
public final class CareNotifyPolicy {

    private CareNotifyPolicy() {}

    public static final String HIGH_IMMEDIATE = "care_task_high_immediate";
    public static final String DAILY_DIGEST = "care_task_daily_digest";
    public static final String CRITICAL_DASHBOARD = "care_task_critical_dashboard";
    public static final String URGE = "care_task_urge";
    public static final String DRILL_ANOMALY = "care_task_drill_anomaly";

    /**
     * 任务创建即时通知的模板：high→即时提醒，critical→看板提示（仅站内）。
     * medium 走每日 09:00 聚合、low 的站内待办就是任务本身 —— 均返回空，不即时发。
     */
    public static Optional<String> codeForCreate(String severity) {
        if ("high".equals(severity)) return Optional.of(HIGH_IMMEDIATE);
        if ("critical".equals(severity)) return Optional.of(CRITICAL_DASHBOARD);
        return Optional.empty();
    }
}
