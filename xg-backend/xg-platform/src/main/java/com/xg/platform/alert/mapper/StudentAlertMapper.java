package com.xg.platform.alert.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.alert.model.StudentAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface StudentAlertMapper extends BaseMapper<StudentAlert> {

    /**
     * Frequency rule: students whose event_type count in the window meets the threshold.
     */
    @Select("""
            SELECT student_id, COUNT(*) AS cnt
              FROM student_event_log
             WHERE event_type = #{eventType}
               AND occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval
             GROUP BY student_id
            HAVING COUNT(*) >= #{threshold}
            """)
    List<Map<String, Object>> findFrequencyCandidates(@Param("eventType") String eventType,
                                                      @Param("windowDays") int windowDays,
                                                      @Param("threshold") int threshold);

    /**
     * Composite rule: students with ≥ distinctThreshold distinct event types, where each
     * type has ≥ perTypeThreshold occurrences in the window. Per-type floor prevents one
     * incidental event per module from pushing a student to critical.
     */
    @Select("""
            <script>
            WITH per_type AS (
                SELECT student_id, event_type, COUNT(*) AS c
                  FROM student_event_log
                 WHERE event_type IN
                       <foreach item="t" collection="eventTypes" open="(" separator="," close=")">#{t}</foreach>
                   AND occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval
                 GROUP BY student_id, event_type
                HAVING COUNT(*) >= #{perTypeThreshold}
            )
            SELECT student_id,
                   COUNT(DISTINCT event_type) AS distinct_cnt,
                   array_agg(DISTINCT event_type) AS types
              FROM per_type
             GROUP BY student_id
            HAVING COUNT(DISTINCT event_type) >= #{distinctThreshold}
            </script>
            """)
    List<Map<String, Object>> findCompositeCandidates(@Param("eventTypes") List<String> eventTypes,
                                                      @Param("windowDays") int windowDays,
                                                      @Param("distinctThreshold") int distinctThreshold,
                                                      @Param("perTypeThreshold") int perTypeThreshold);

    /**
     * Cooldown gate: returns true if the same (student, rule) had an alert resolved within
     * the last cooldownDays. Prevents immediate re-open while the originating events are
     * still in window.
     */
    @Select("""
            SELECT EXISTS (
                SELECT 1 FROM student_alert
                 WHERE student_id = #{studentId}
                   AND alert_rule_id = #{ruleId}
                   AND status = 'resolved'
                   AND resolved_at IS NOT NULL
                   AND resolved_at >= NOW() - (#{cooldownDays}::text || ' days')::interval
            )
            """)
    boolean hasRecentResolved(@Param("studentId") Long studentId,
                              @Param("ruleId") Long ruleId,
                              @Param("cooldownDays") int cooldownDays);

    /**
     * Open alerts grouped by (student_id, severity), used by the workspace risk enricher
     * to flag students whose pending approval task carries active red/yellow flags.
     */
    @Select("""
            <script>
            SELECT student_id, severity, COUNT(*) AS cnt
              FROM student_alert
             WHERE student_id IN
                   <foreach item="id" collection="studentIds" open="(" separator="," close=")">#{id}</foreach>
               AND status IN ('open', 'acknowledged')
             GROUP BY student_id, severity
            </script>
            """)
    List<Map<String, Object>> countOpenBySeverity(@Param("studentIds") List<Long> studentIds);

    /**
     * Fetch the most recent events of a given type(s) for a student within the window.
     * Used by the alert engine to build the per-alert explanation — counselors see which
     * specific events triggered the rule, not just aggregate counts.
     */
    @Select("""
            SELECT id, event_type, event_data, occurred_at
              FROM student_event_log
             WHERE student_id = #{studentId}
               AND event_type = #{eventType}
               AND occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval
             ORDER BY occurred_at DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> findRecentEventsByType(@Param("studentId") Long studentId,
                                                     @Param("eventType") String eventType,
                                                     @Param("windowDays") int windowDays,
                                                     @Param("limit") int limit);

    @Select("""
            <script>
            SELECT id, event_type, event_data, occurred_at
              FROM student_event_log
             WHERE student_id = #{studentId}
               AND event_type IN
                   <foreach item="t" collection="eventTypes" open="(" separator="," close=")">#{t}</foreach>
               AND occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval
             ORDER BY occurred_at DESC
             LIMIT #{limit}
            </script>
            """)
    List<Map<String, Object>> findRecentEventsByTypes(@Param("studentId") Long studentId,
                                                      @Param("eventTypes") List<String> eventTypes,
                                                      @Param("windowDays") int windowDays,
                                                      @Param("limit") int limit);

    /**
     * Per-rule operations stats over the last {@code windowDays}. Surfaces fire count, ack /
     * resolve / false-positive breakdowns, and median response time so counselors can identify
     * noisy rules that need tuning.
     */
    @Select("""
            SELECT
              alert_rule_id,
              COUNT(*) FILTER (WHERE created_at > NOW() - (#{windowDays}::text || ' days')::interval) AS fires,
              COUNT(*) FILTER (WHERE status = 'acknowledged') AS acked,
              COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
              COUNT(*) FILTER (WHERE status = 'false_positive') AS false_positives,
              AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60.0)
                FILTER (WHERE acknowledged_at IS NOT NULL) AS avg_ack_minutes,
              MAX(created_at) AS last_fired_at
            FROM student_alert
            GROUP BY alert_rule_id
            """)
    List<Map<String, Object>> aggregateRuleStats(@Param("windowDays") int windowDays);
}
