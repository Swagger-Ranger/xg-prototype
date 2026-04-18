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
     * Composite rule: students whose distinct event_types within the set count meets the threshold.
     */
    @Select("""
            <script>
            SELECT student_id,
                   COUNT(DISTINCT event_type) AS distinct_cnt,
                   array_agg(DISTINCT event_type) AS types
              FROM student_event_log
             WHERE event_type IN
                   <foreach item="t" collection="eventTypes" open="(" separator="," close=")">#{t}</foreach>
               AND occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval
             GROUP BY student_id
            HAVING COUNT(DISTINCT event_type) >= #{distinctThreshold}
            </script>
            """)
    List<Map<String, Object>> findCompositeCandidates(@Param("eventTypes") List<String> eventTypes,
                                                      @Param("windowDays") int windowDays,
                                                      @Param("distinctThreshold") int distinctThreshold);
}
