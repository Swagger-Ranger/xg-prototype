package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 规则引擎的聚合查询。返回 {@code List<Map>}（与 OrgAssignmentService /
 * WorkspaceMetricsService 同款解析风格，规避 record/POJO 映射不确定性）。
 *
 * <p>所有查询显式带 {@code tenant_id = #{tenantId}}：不依赖 MyBatis-Plus 租户插件
 * 是否覆盖 student_event_log —— 跨租户串数据是安全事故，显式过滤兜底，冗余无害。
 */
@Mapper
public interface CareRuleQueryMapper {

    /**
     * 窗口内某类事件计数 >= minCount，可叠加 severity 区间。
     * R001 / R006 / R007 / R011a / R011b / R012 共用。
     */
    @Select("""
            <script>
            SELECT student_id, COUNT(*) AS cnt
              FROM student_event_log
             WHERE tenant_id = #{tenantId}
               AND occurred_at &gt;= #{since}
               AND event_type IN
                   <foreach collection="eventTypes" item="t" open="(" separator="," close=")">#{t}</foreach>
               <if test="sevMin != null">AND severity &gt;= #{sevMin}</if>
               <if test="sevMax != null">AND severity &lt;= #{sevMax}</if>
             GROUP BY student_id
            HAVING COUNT(*) &gt;= #{minCount}
            </script>
            """)
    List<Map<String, Object>> countByEventTypes(@Param("tenantId") String tenantId,
                                                @Param("since") OffsetDateTime since,
                                                @Param("eventTypes") List<String> eventTypes,
                                                @Param("minCount") int minCount,
                                                @Param("sevMin") Integer sevMin,
                                                @Param("sevMax") Integer sevMax);

    /**
     * 窗口内不同事件来源类别数 >= minCount（R009 多模块异常）。
     * 类别口径 = distinct event_source，且只数 severity >= sevMin 的"异常"事件。
     */
    @Select("""
            SELECT student_id, COUNT(DISTINCT event_source) AS cnt
              FROM student_event_log
             WHERE tenant_id = #{tenantId}
               AND occurred_at >= #{since}
               AND severity >= #{sevMin}
             GROUP BY student_id
            HAVING COUNT(DISTINCT event_source) >= #{minCount}
            """)
    List<Map<String, Object>> countDistinctSources(@Param("tenantId") String tenantId,
                                                   @Param("since") OffsetDateTime since,
                                                   @Param("minCount") int minCount,
                                                   @Param("sevMin") int sevMin);

    /**
     * 有历史关怀任务 且 窗口内无谈话记录的学生（R008 长期无跟进）。
     * "有历史"= care_task 里出现过该学生（任何状态）；不限定已关闭，因为在跟进中但久无谈话同样值得提醒。
     */
    @Select("""
            SELECT DISTINCT ct.student_id
              FROM care_task ct
             WHERE ct.tenant_id = #{tenantId}
               AND NOT EXISTS (
                   SELECT 1 FROM student_event_log e
                    WHERE e.tenant_id = #{tenantId}
                      AND e.student_id = ct.student_id
                      AND e.event_type = 'counselor_talk_recorded'
                      AND e.occurred_at >= #{since})
            """)
    List<Long> studentsWithHistoryNoFollowup(@Param("tenantId") String tenantId,
                                             @Param("since") OffsetDateTime since);
}
