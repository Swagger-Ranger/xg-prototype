package com.xg.business.checkin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.checkin.model.CheckinRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface CheckinRecordMapper extends BaseMapper<CheckinRecord> {

    @Select("""
            <script>
            SELECT student_id, COUNT(*) AS cnt
              FROM checkin_record
             WHERE status = 'absent'
               AND student_id IN
                   <foreach item="id" collection="studentIds" open="(" separator="," close=")">#{id}</foreach>
               AND created_at >= NOW() - (#{windowDays}::text || ' days')::interval
             GROUP BY student_id
            </script>
            """)
    List<Map<String, Object>> countAbsentByStudents(@Param("studentIds") List<Long> studentIds,
                                                     @Param("windowDays") int windowDays);
}
