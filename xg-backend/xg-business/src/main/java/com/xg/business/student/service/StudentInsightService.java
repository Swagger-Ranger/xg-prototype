package com.xg.business.student.service;

import com.xg.business.student.dto.StudentInsightResponse;
import com.xg.business.student.dto.StudentInsightResponse.MetricSet;
import com.xg.business.student.dto.StudentInsightResponse.PeerBlock;
import com.xg.business.student.dto.StudentInsightResponse.TrendPoint;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudentInsightService {

    private final JdbcTemplate jdbc;

    /**
     * Build the AI insight payload for a student profile id.
     * Peer scope = same class_id (tightest realistic peer group for a counselor's view).
     */
    public StudentInsightResponse compute(Long profileId) {
        // 1. Look up the target user_id + class.
        Map<String, Object> head;
        try {
            head = jdbc.queryForMap(
                    "SELECT sp.user_id, sp.class_id, sp.class_name " +
                    "FROM student_profile sp WHERE sp.id = ? AND sp.deleted_at IS NULL",
                    profileId);
        } catch (Exception e) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }

        Long userId = ((Number) head.get("user_id")).longValue();
        Object classIdObj = head.get("class_id");
        Long classId = classIdObj == null ? null : ((Number) classIdObj).longValue();
        String className = (String) head.get("class_name");

        PeerBlock peer = computePeer(userId, classId, className);
        List<TrendPoint> trend = computeTrend(userId);

        return StudentInsightResponse.builder().peer(peer).trend(trend).build();
    }

    // ------------------------------------------------------------------
    // Peer comparison: 5 metrics across the last 90 days, same class scope.
    // ------------------------------------------------------------------
    private PeerBlock computePeer(Long selfUserId, Long classId, String className) {
        if (classId == null) {
            return PeerBlock.builder()
                    .scope("（未分班级，无法计算同伴对比）")
                    .peerCount(0)
                    .self(zero())
                    .classAvg(zero())
                    .classMax(zero())
                    .percentile(zero())
                    .build();
        }

        // One query pulls 5 metrics for every classmate.
        String sql =
                "WITH cls AS ( " +
                "  SELECT sp.user_id FROM student_profile sp " +
                "  WHERE sp.class_id = ? AND sp.deleted_at IS NULL " +
                ") " +
                "SELECT c.user_id, " +
                "  COALESCE(v.cnt, 0)  AS violations, " +
                "  COALESCE(a.cnt, 0)  AS open_alerts, " +
                "  COALESCE(l.days, 0) AS leave_days, " +
                "  COALESCE(cl.cnt, 0) AS late_absent, " +
                "  COALESCE(t.cnt, 0)  AS talks " +
                "FROM cls c " +
                "LEFT JOIN ( " +
                "  SELECT student_id, COUNT(*) cnt FROM violation_record " +
                "  WHERE occurred_at > NOW() - INTERVAL '90 days' AND deleted_at IS NULL " +
                "  GROUP BY student_id " +
                ") v ON v.student_id = c.user_id " +
                "LEFT JOIN ( " +
                "  SELECT student_id, COUNT(*) cnt FROM student_alert " +
                "  WHERE status = 'open' " +
                "  GROUP BY student_id " +
                ") a ON a.student_id = c.user_id " +
                "LEFT JOIN ( " +
                "  SELECT student_id, SUM(COALESCE((event_data->>'days')::numeric, 1)) AS days " +
                "  FROM student_event_log " +
                "  WHERE event_type = 'leave_submit' AND occurred_at > NOW() - INTERVAL '90 days' " +
                "  GROUP BY student_id " +
                ") l ON l.student_id = c.user_id " +
                "LEFT JOIN ( " +
                "  SELECT student_id, COUNT(*) cnt FROM student_event_log " +
                "  WHERE event_type IN ('checkin_late','checkin_absent') " +
                "    AND occurred_at > NOW() - INTERVAL '90 days' " +
                "  GROUP BY student_id " +
                ") cl ON cl.student_id = c.user_id " +
                "LEFT JOIN ( " +
                "  SELECT student_id, COUNT(*) cnt FROM counselor_talk " +
                "  WHERE talk_at > NOW() - INTERVAL '90 days' AND deleted_at IS NULL " +
                "  GROUP BY student_id " +
                ") t ON t.student_id = c.user_id";

        List<Map<String, Object>> rows = jdbc.queryForList(sql, classId);

        MetricSet self = zero();
        List<MetricSet> all = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            MetricSet m = MetricSet.builder()
                    .violations(num(row.get("violations")))
                    .openAlerts(num(row.get("open_alerts")))
                    .leaveDays(num(row.get("leave_days")))
                    .lateAbsent(num(row.get("late_absent")))
                    .talks(num(row.get("talks")))
                    .build();
            all.add(m);
            if (selfUserId.equals(((Number) row.get("user_id")).longValue())) {
                self = m;
            }
        }

        int peerCount = Math.max(0, all.size() - 1);
        MetricSet avg = averageOf(all);
        MetricSet max = maxOf(all);
        MetricSet pct = percentileOf(self, all);

        return PeerBlock.builder()
                .scope(className != null ? className : "同班")
                .peerCount(peerCount)
                .self(self)
                .classAvg(avg)
                .classMax(max)
                .percentile(pct)
                .build();
    }

    // ------------------------------------------------------------------
    // Trend: 6 monthly buckets (oldest → newest) of events / alerts / talks.
    // ------------------------------------------------------------------
    private List<TrendPoint> computeTrend(Long userId) {
        // Generate 6-month series so empty months still render.
        String sql =
                "WITH months AS ( " +
                "  SELECT TO_CHAR(DATE_TRUNC('month', (NOW() - make_interval(months => gs))::date), 'YYYY-MM') AS m " +
                "  FROM generate_series(0, 5) gs " +
                "), ev AS ( " +
                "  SELECT TO_CHAR(DATE_TRUNC('month', occurred_at), 'YYYY-MM') AS m, " +
                "         COUNT(*) FILTER (WHERE severity >= 6)            AS high_events, " +
                "         COUNT(*) FILTER (WHERE severity BETWEEN 1 AND 5) AS mid_low_events " +
                "  FROM student_event_log " +
                "  WHERE student_id = ? AND occurred_at > NOW() - INTERVAL '6 months' " +
                "  GROUP BY 1 " +
                "), al AS ( " +
                "  SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS m, COUNT(*) AS alerts " +
                "  FROM student_alert " +
                "  WHERE student_id = ? AND created_at > NOW() - INTERVAL '6 months' " +
                "  GROUP BY 1 " +
                "), tk AS ( " +
                "  SELECT TO_CHAR(DATE_TRUNC('month', talk_at), 'YYYY-MM') AS m, COUNT(*) AS talks " +
                "  FROM counselor_talk " +
                "  WHERE student_id = ? AND deleted_at IS NULL AND talk_at > NOW() - INTERVAL '6 months' " +
                "  GROUP BY 1 " +
                ") " +
                "SELECT m.m AS month, " +
                "       COALESCE(ev.high_events, 0)    AS high_events, " +
                "       COALESCE(ev.mid_low_events, 0) AS mid_low_events, " +
                "       COALESCE(al.alerts, 0)         AS alerts, " +
                "       COALESCE(tk.talks, 0)          AS talks " +
                "FROM months m " +
                "LEFT JOIN ev ON ev.m = m.m " +
                "LEFT JOIN al ON al.m = m.m " +
                "LEFT JOIN tk ON tk.m = m.m " +
                "ORDER BY m.m";

        List<Map<String, Object>> rows = jdbc.queryForList(sql, userId, userId, userId);
        List<TrendPoint> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            out.add(TrendPoint.builder()
                    .month((String) r.get("month"))
                    .highEvents(((Number) r.get("high_events")).intValue())
                    .midLowEvents(((Number) r.get("mid_low_events")).intValue())
                    .alerts(((Number) r.get("alerts")).intValue())
                    .talks(((Number) r.get("talks")).intValue())
                    .build());
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Metric helpers
    // ------------------------------------------------------------------
    private static MetricSet zero() {
        return MetricSet.builder().build();
    }

    private static double num(Object v) {
        if (v == null) return 0;
        if (v instanceof Number n) return n.doubleValue();
        return Double.parseDouble(v.toString());
    }

    private static MetricSet averageOf(List<MetricSet> all) {
        if (all.isEmpty()) return zero();
        double n = all.size();
        double v = 0, a = 0, l = 0, c = 0, t = 0;
        for (MetricSet m : all) {
            v += m.getViolations();
            a += m.getOpenAlerts();
            l += m.getLeaveDays();
            c += m.getLateAbsent();
            t += m.getTalks();
        }
        return MetricSet.builder()
                .violations(round1(v / n))
                .openAlerts(round1(a / n))
                .leaveDays(round1(l / n))
                .lateAbsent(round1(c / n))
                .talks(round1(t / n))
                .build();
    }

    private static MetricSet maxOf(List<MetricSet> all) {
        if (all.isEmpty()) return zero();
        double v = 0, a = 0, l = 0, c = 0, t = 0;
        for (MetricSet m : all) {
            v = Math.max(v, m.getViolations());
            a = Math.max(a, m.getOpenAlerts());
            l = Math.max(l, m.getLeaveDays());
            c = Math.max(c, m.getLateAbsent());
            t = Math.max(t, m.getTalks());
        }
        return MetricSet.builder()
                .violations(v).openAlerts(a).leaveDays(l).lateAbsent(c).talks(t).build();
    }

    /**
     * Percentile rank where 100 = worst in class for that metric.
     * Ties resolve as midrank so identical scores share the same percentile.
     */
    private static MetricSet percentileOf(MetricSet self, List<MetricSet> all) {
        if (all.size() <= 1) {
            return MetricSet.builder()
                    .violations(50).openAlerts(50).leaveDays(50).lateAbsent(50).talks(50).build();
        }
        return MetricSet.builder()
                .violations(pct(self.getViolations(), all, MetricSet::getViolations))
                .openAlerts(pct(self.getOpenAlerts(), all, MetricSet::getOpenAlerts))
                .leaveDays(pct(self.getLeaveDays(), all, MetricSet::getLeaveDays))
                .lateAbsent(pct(self.getLateAbsent(), all, MetricSet::getLateAbsent))
                .talks(pct(self.getTalks(), all, MetricSet::getTalks))
                .build();
    }

    private static double pct(double v, List<MetricSet> all, java.util.function.ToDoubleFunction<MetricSet> f) {
        int below = 0, equal = 0;
        for (MetricSet m : all) {
            double x = f.applyAsDouble(m);
            if (x < v) below++;
            else if (x == v) equal++;
        }
        double rank = below + equal / 2.0;
        return round1(rank * 100.0 / all.size());
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
