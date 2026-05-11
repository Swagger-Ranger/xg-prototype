package com.xg.business.metrics.enums;

import java.util.Arrays;
import java.util.Optional;

/**
 * 「问数 metric 注册表」。每个 enum 是一个被允许的 NL 问数目标 — LLM 只能选这里出现的
 * id,后端跑写死的 SQL。新增 metric = 加 enum + MetricMapper SQL + MetricsService dispatch。
 *
 * <p>命名:小写.下划线分组 — `<域>.<指标>`。
 */
public enum MetricId {

    /* ───────── 请销假域 ───────── */

    /** 请假条数。维度:college / class / leave_type / status / month / week。 */
    LEAVE_COUNT("leave.count"),

    /** 请假通过率 = approved / (approved + rejected)。同口径维度。 */
    LEAVE_PASS_RATE("leave.pass_rate"),

    /** 平均请假时长(天)。 */
    LEAVE_DURATION_AVG("leave.duration_avg"),

    /** 平均审批耗时(小时,从提交到 approved / rejected)。 */
    LEAVE_REVIEW_DURATION_AVG("leave.review_duration_avg"),

    /** 驳回理由 Top N(LLM 聚类后端只给原文)。 */
    LEAVE_REJECT_TOP_REASONS("leave.reject_top_reasons"),

    /** 长期未销假名单(approved 且超过 end_time 24h 仍未 cancelled)。 */
    LEAVE_NO_RETURN_OVERDUE("leave.no_return_overdue"),

    /* ───────── 学生 / 班级域 ───────── */

    /** 高频请假学生 Top N(默认本学期累计天数 desc)。 */
    STUDENT_FREQUENT_LEAVER("student.frequent_leaver"),

    /** 班级请假密度(条数 / 班级学生数)Top N。 */
    CLASS_LEAVE_DENSITY("class.leave_density"),

    /** 学期累计超限学生(>= leave_global_config.term_max_days)。 */
    STUDENT_TERM_CUMULATIVE_EXCEED("student.term_cumulative_exceed"),

    /* ───────── 审批人域 ───────── */

    /** 各审批人/角色 任务量。 */
    APPROVER_WORKLOAD("approver.workload"),

    /** 审批最慢 Top N(平均节点耗时 desc)。 */
    APPROVER_SLOW_TOP("approver.slow_top"),

    /* ───────── 预警域 ───────── */

    /** 预警按类型分布。 */
    ALERT_COUNT_BY_TYPE("alert.count_by_type");

    private final String code;

    MetricId(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<MetricId> fromCode(String code) {
        if (code == null) return Optional.empty();
        return Arrays.stream(values()).filter(m -> m.code.equals(code)).findFirst();
    }
}
