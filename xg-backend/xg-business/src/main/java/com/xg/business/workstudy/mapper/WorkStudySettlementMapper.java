package com.xg.business.workstudy.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface WorkStudySettlementMapper {

    /**
     * Settled timesheets (confirmed or officer-finalized) that do not yet have a
     * salary row. Joined with {@code work_study_position} so we can snapshot the
     * hourly rate at settlement time — future rate changes on the position do not
     * retroactively reprice already-generated salary rows.
     *
     * Idempotency is also enforced by {@code uq_ws_salary_timesheet} (partial
     * unique index where deleted_at IS NULL) — the NOT EXISTS pre-filter is just
     * to avoid the insert round-trip.
     */
    @Select("""
            SELECT t.id            AS timesheet_id,
                   t.student_id    AS student_id,
                   t.position_id   AS position_id,
                   t.month         AS month,
                   t.hours_final   AS hours_final,
                   COALESCE(p.hourly_rate, p.salary_amount) AS hourly_rate
              FROM work_study_timesheet t
              JOIN work_study_position p ON p.id = t.position_id
             WHERE t.status IN ('confirmed', 'finalized')
               AND t.hours_final IS NOT NULL
               AND t.deleted_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM work_study_salary s
                    WHERE s.timesheet_id = t.id
                      AND s.deleted_at IS NULL
               )
            """)
    List<Map<String, Object>> findSettleableTimesheets();
}
