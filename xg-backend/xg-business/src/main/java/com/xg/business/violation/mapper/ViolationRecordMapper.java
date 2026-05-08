package com.xg.business.violation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.violation.model.ViolationRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ViolationRecordMapper extends BaseMapper<ViolationRecord> {

    @Select("""
            <script>
            SELECT student_id,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE punishment_id IS NULL) AS unpunished,
                   COUNT(*) FILTER (WHERE occurred_at >= NOW() - (#{windowDays}::text || ' days')::interval) AS recent
              FROM violation_record
             WHERE student_id IN
                   <foreach item="id" collection="studentIds" open="(" separator="," close=")">#{id}</foreach>
             GROUP BY student_id
            </script>
            """)
    List<Map<String, Object>> aggregateByStudents(@Param("studentIds") List<Long> studentIds,
                                                   @Param("windowDays") int windowDays);
}
