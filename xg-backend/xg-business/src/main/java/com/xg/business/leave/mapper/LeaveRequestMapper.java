package com.xg.business.leave.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.leave.model.LeaveRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface LeaveRequestMapper extends BaseMapper<LeaveRequest> {

    @Select("""
            <script>
            SELECT student_id, COUNT(*) AS cnt
              FROM leave_request
             WHERE student_id IN
                   <foreach item="id" collection="studentIds" open="(" separator="," close=")">#{id}</foreach>
               AND status IN ('approved', 'pending')
               AND created_at >= NOW() - (#{windowDays}::text || ' days')::interval
             GROUP BY student_id
            </script>
            """)
    List<Map<String, Object>> countLeaveByStudents(@Param("studentIds") List<Long> studentIds,
                                                    @Param("windowDays") int windowDays);

    /**
     * Same-leave-type history for a single student over a recent window. Used
     * by the AI recommendation context to surface "this student has already
     * taken N similar leaves recently" — pattern signal the rule engine doesn't
     * carry. Returns {cnt: long, total_days: numeric} or null on empty.
     * Excludes the leave currently being approved (excludeLeaveId may be null).
     */
    @Select("""
            <script>
            SELECT COUNT(*) AS cnt,
                   COALESCE(SUM(duration_days), 0) AS total_days
              FROM leave_request
             WHERE student_id = #{studentId}
               AND leave_type_code = #{leaveTypeCode}
               AND status IN ('approved', 'pending', 'cancel_pending')
               AND created_at >= NOW() - (#{windowDays}::text || ' days')::interval
               <if test="excludeLeaveId != null">AND id <![CDATA[<>]]> #{excludeLeaveId}</if>
            </script>
            """)
    Map<String, Object> countSimilarByStudent(@Param("studentId") Long studentId,
                                              @Param("leaveTypeCode") String leaveTypeCode,
                                              @Param("windowDays") int windowDays,
                                              @Param("excludeLeaveId") Long excludeLeaveId);

    /**
     * AI Draft per-field accuracy over the last N days. For each predicted
     * field we report match/mismatch counts: match means the AI's prediction
     * equals the student's final submitted value. Predicted-but-null on the
     * AI side counts as neither match nor mismatch — the AI didn't try.
     * start_date / end_date compare against start_time / end_time formatted
     * as YYYY-MM-DD in Asia/Shanghai (matching the chat agent's resolve_date
     * convention).
     */
    @Select("""
            SELECT
              SUM(CASE WHEN p->>'leave_type' = leave_type_code THEN 1 ELSE 0 END) AS leave_type_match,
              SUM(CASE WHEN p->>'leave_type' IS NOT NULL AND p->>'leave_type' <> leave_type_code THEN 1 ELSE 0 END) AS leave_type_mismatch,
              SUM(CASE WHEN p->>'reason' = reason THEN 1 ELSE 0 END) AS reason_match,
              SUM(CASE WHEN p->>'reason' IS NOT NULL AND p->>'reason' <> reason THEN 1 ELSE 0 END) AS reason_mismatch,
              SUM(CASE WHEN p->>'start_date' = to_char(start_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') THEN 1 ELSE 0 END) AS start_date_match,
              SUM(CASE WHEN p->>'start_date' IS NOT NULL AND p->>'start_date' <> to_char(start_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') THEN 1 ELSE 0 END) AS start_date_mismatch,
              SUM(CASE WHEN p->>'end_date' = to_char(end_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') THEN 1 ELSE 0 END) AS end_date_match,
              SUM(CASE WHEN p->>'end_date' IS NOT NULL AND p->>'end_date' <> to_char(end_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') THEN 1 ELSE 0 END) AS end_date_mismatch,
              SUM(CASE WHEN p->>'destination' = (form_data->>'destination') THEN 1 ELSE 0 END) AS destination_match,
              SUM(CASE WHEN p->>'destination' IS NOT NULL AND p->>'destination' <> COALESCE(form_data->>'destination', '') THEN 1 ELSE 0 END) AS destination_mismatch,
              COUNT(*) AS total
              FROM (
                SELECT ai_draft->'predicted_fields' AS p,
                       leave_type_code, reason, start_time, end_time, form_data
                  FROM leave_request
                 WHERE ai_draft IS NOT NULL
                   AND created_at >= NOW() - (#{windowDays}::text || ' days')::interval
              ) sub
            """)
    Map<String, Object> draftFieldAccuracy(@Param("windowDays") int windowDays);

    /**
     * 商用前 #5 — sum of {@code duration_days} for the student's
     * non-rejected leaves of one type that overlap the given term window.
     * {@code pending} / {@code approved} / {@code cancel_pending} all count
     * against the term cap (cancellation is not yet decided).
     *
     * <p>Uses a half-open day-level overlap check ({@code start_time::date <= toDate}
     * AND {@code end_time::date >= fromDate}) so a leave straddling the term
     * boundary still counts in full — matches the校规 "学期内累计天数" intent.
     */
    @Select("""
            SELECT COALESCE(SUM(duration_days), 0) AS total
              FROM leave_request
             WHERE student_id = #{studentId}
               AND leave_type_code = #{leaveTypeCode}
               AND status IN ('pending', 'approved', 'cancel_pending')
               AND start_time::date <= #{toDate}
               AND end_time::date   >= #{fromDate}
               AND deleted_at IS NULL
            """)
    BigDecimal sumDurationDaysInRange(@Param("studentId") Long studentId,
                                      @Param("leaveTypeCode") String leaveTypeCode,
                                      @Param("fromDate") LocalDate fromDate,
                                      @Param("toDate") LocalDate toDate);

    /**
     * 批量统计一组学生在 [fromDate, toDate] 区间内、所有假别合计的请假天数。
     * PendingTaskEnricher 用来一次拉齐"本学期累计天数",免得每个学生单查一次。
     * 累计口径与 {@code LeaveService.getTermUsage} 保持一致:status ∈
     * {pending, approved} 且 start_time 落在区间内。
     */
    @Select("""
            <script>
            SELECT student_id, COALESCE(SUM(duration_days), 0) AS total
              FROM leave_request
             WHERE student_id IN
                   <foreach item="id" collection="studentIds" open="(" separator="," close=")">#{id}</foreach>
               AND status IN ('pending', 'approved')
               AND start_time::date >= #{fromDate}
               AND start_time::date <![CDATA[<=]]> #{toDate}
               AND deleted_at IS NULL
             GROUP BY student_id
            </script>
            """)
    List<Map<String, Object>> sumTermDaysByStudents(@Param("studentIds") List<Long> studentIds,
                                                     @Param("fromDate") LocalDate fromDate,
                                                     @Param("toDate") LocalDate toDate);
}
