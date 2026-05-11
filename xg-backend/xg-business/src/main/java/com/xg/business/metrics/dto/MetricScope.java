package com.xg.business.metrics.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 当前用户的数据 scope。MetricsService 在每个 metric 跑 SQL 前会带上这个,
 * SQL 里的 WHERE 拼装根据 scope 改:
 *
 *  - DEAN_OF_COLLEGE: 强加 WHERE student.college_id = collegeId。
 *    并允许"自己学院 vs 全校均值/中位数"作为对比维度,不返回其他学院明细。
 *
 *  - WHOLE_SCHOOL:    不加 college 过滤,全表 / per-college 分组都可。
 *    student_affairs_director / super_admin / school_admin 走这条。
 *
 *  - DENIED:          其他角色(student / counselor / etc)直接 403,
 *    不进入 metric resolver。
 */
@Data
@AllArgsConstructor
public class MetricScope {

    public enum Kind { DEAN_OF_COLLEGE, WHOLE_SCHOOL, DENIED }

    private final Kind kind;

    /** DEAN_OF_COLLEGE 时是院长所在 college 的 org_unit.id;其他模式 null。 */
    private final Long collegeId;

    /** DEAN_OF_COLLEGE 时是 college 中文名(给 context.college_name 用);其他模式 null。 */
    private final String collegeName;

    public static MetricScope denied() {
        return new MetricScope(Kind.DENIED, null, null);
    }

    public static MetricScope wholeSchool() {
        return new MetricScope(Kind.WHOLE_SCHOOL, null, null);
    }

    public static MetricScope deanOf(Long collegeId, String collegeName) {
        return new MetricScope(Kind.DEAN_OF_COLLEGE, collegeId, collegeName);
    }
}
