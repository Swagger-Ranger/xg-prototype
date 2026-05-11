package com.xg.business.metrics.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Metric 实际 SQL。每条 metric 一个方法,SQL 写死。
 *
 * <p>设计原则:
 *  - 任何 metric 都接 collegeIdFilter(NULL=全校,非 NULL=单学院)
 *  - 时间窗用 (sinceUtc, untilUtc) 半开区间;NULL=不限
 *  - 返回 Map row,JSON 序列化天然友好,前端按 chartType 自行 unpack 字段
 *  - 院长视角下需要"自己学院 vs 全校均值"对比时,service 层跑两次 query 拼装
 */
@Mapper
public interface MetricMapper {

    /* ───────── leave.count ───────── */

    /**
     * 请假总条数。单值版(不切维度)。
     *  - collegeIdFilter null = 全校,非 null = 该学院
     *  - leaveTypeCode null = 全部假别
     *  - status null = 全部状态(pending/approved/rejected/cancelled)
     */
    @Select("""
            <script>
            SELECT COUNT(*) AS value
              FROM leave_request lr
            <if test="collegeIdFilter != null">
              JOIN student_profile sp ON sp.user_id = lr.student_id AND sp.deleted_at IS NULL
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
                                 AND oc.ancestor_id = #{collegeIdFilter}
            </if>
             WHERE lr.deleted_at IS NULL
            <if test="sinceUtc != null">
               AND lr.created_at >= #{sinceUtc}
            </if>
            <if test="untilUtc != null">
               AND lr.created_at &lt; #{untilUtc}
            </if>
            <if test="leaveTypeCode != null and leaveTypeCode != ''">
               AND lr.leave_type_code = #{leaveTypeCode}
            </if>
            <if test="status != null and status != ''">
               AND lr.status = #{status}
            </if>
            </script>
            """)
    Long leaveCountTotal(
            @Param("collegeIdFilter") Long collegeIdFilter,
            @Param("sinceUtc") OffsetDateTime sinceUtc,
            @Param("untilUtc") OffsetDateTime untilUtc,
            @Param("leaveTypeCode") String leaveTypeCode,
            @Param("status") String status);

    /**
     * 请假条数按假别分组。Top N 风格的 bar 图。
     */
    @Select("""
            <script>
            SELECT lr.leave_type_code AS label, COUNT(*) AS value
              FROM leave_request lr
            <if test="collegeIdFilter != null">
              JOIN student_profile sp ON sp.user_id = lr.student_id AND sp.deleted_at IS NULL
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
                                 AND oc.ancestor_id = #{collegeIdFilter}
            </if>
             WHERE lr.deleted_at IS NULL
            <if test="sinceUtc != null">
               AND lr.created_at >= #{sinceUtc}
            </if>
            <if test="untilUtc != null">
               AND lr.created_at &lt; #{untilUtc}
            </if>
            <if test="status != null and status != ''">
               AND lr.status = #{status}
            </if>
             GROUP BY lr.leave_type_code
             ORDER BY value DESC
            </script>
            """)
    List<Map<String, Object>> leaveCountByLeaveType(
            @Param("collegeIdFilter") Long collegeIdFilter,
            @Param("sinceUtc") OffsetDateTime sinceUtc,
            @Param("untilUtc") OffsetDateTime untilUtc,
            @Param("status") String status);

    /**
     * 请假条数按学院分组。学工部部长 / super_admin 用,跨学院对比。
     * 院长 scope 下这条不暴露(service 层拦)。
     */
    @Select("""
            <script>
            SELECT ou.id AS college_id, ou.name AS label, COUNT(*) AS value
              FROM leave_request lr
              JOIN student_profile sp ON sp.user_id = lr.student_id AND sp.deleted_at IS NULL
              JOIN org_closure oc ON oc.descendant_id = sp.class_id
              JOIN org_unit ou ON ou.id = oc.ancestor_id
                              AND ou.type = 'college'
                              AND ou.deleted_at IS NULL
             WHERE lr.deleted_at IS NULL
            <if test="sinceUtc != null">
               AND lr.created_at >= #{sinceUtc}
            </if>
            <if test="untilUtc != null">
               AND lr.created_at &lt; #{untilUtc}
            </if>
            <if test="status != null and status != ''">
               AND lr.status = #{status}
            </if>
             GROUP BY ou.id, ou.name
             ORDER BY value DESC
            </script>
            """)
    List<Map<String, Object>> leaveCountByCollege(
            @Param("sinceUtc") OffsetDateTime sinceUtc,
            @Param("untilUtc") OffsetDateTime untilUtc,
            @Param("status") String status);

    /* ───────── academic_term 帮助方法 ───────── */

    /**
     * 当前学期(is_current=true 唯一行)。给 metric resolver 默认时间窗用。
     */
    @Select("""
            SELECT code, name, start_date, end_date
              FROM academic_term
             WHERE is_current = TRUE
             LIMIT 1
            """)
    Map<String, Object> findCurrentTerm();

    /**
     * 按 code 查指定学期(同期对比、上学期对比用)。
     */
    @Select("""
            SELECT code, name, start_date, end_date
              FROM academic_term
             WHERE code = #{code}
             LIMIT 1
            """)
    Map<String, Object> findTermByCode(@Param("code") String code);
}
