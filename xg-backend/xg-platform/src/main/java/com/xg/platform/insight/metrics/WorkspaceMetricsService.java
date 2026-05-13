package com.xg.platform.insight.metrics;

import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Aggregates role-scoped workspace metrics from the tenant schema for the LLM.
 *
 * Uses raw JDBC with the current tenant's schema qualifier — deliberately avoids
 * the business-layer mappers so this service stays in xg-platform without pulling
 * an xg-business dependency (which would create a module cycle).
 *
 * The shape is intentionally flat and keyed in snake_case — the Python side
 * references these keys in its generated {@code refs} array.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceMetricsService {

    private final JdbcTemplate jdbc;

    public Map<String, Object> collectForDean() {
        String schema = schema();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scope", "global");

        m.put("total_students", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".sys_user u " +
                        "JOIN " + schema + ".sys_user_role r ON u.id = r.user_id " +
                        "WHERE r.role_id = 1 AND u.status = 'active'"));
        m.put("total_counselors", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".sys_user u " +
                        "JOIN " + schema + ".sys_user_role r ON u.id = r.user_id " +
                        "WHERE r.role_id = 2 AND u.status = 'active'"));

        m.put("alerts_by_severity", groupCount(
                "SELECT severity, COUNT(*) FROM " + schema + ".student_alert " +
                        "WHERE status = 'open' GROUP BY severity"));
        m.put("alerts_open_total", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_alert WHERE status = 'open'"));
        m.put("recent_alerts", recentAlerts(schema, null, 8));

        m.put("leave_pending", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".leave_request WHERE status = 'pending'"));
        m.put("leave_submitted_last_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'leave_submit' AND occurred_at > NOW() - INTERVAL '7 days'"));
        m.put("leave_submitted_prev_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'leave_submit' " +
                        "  AND occurred_at > NOW() - INTERVAL '14 days' " +
                        "  AND occurred_at <= NOW() - INTERVAL '7 days'"));

        m.put("violations_last_30d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'violation_recorded' AND occurred_at > NOW() - INTERVAL '30 days'"));
        m.put("checkin_late_last_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'checkin_late' AND occurred_at > NOW() - INTERVAL '7 days'"));

        m.put("top_counselor_workload", topCounselorWorkload(schema, 3));

        m.put("notifications_in_progress", recentNotificationTasks(schema, null, 6));
        m.put("collections_in_progress", recentCollectionForms(schema, null, 6));

        return m;
    }

    public Map<String, Object> collectForCounselor(Long counselorId) {
        return collectCounselorMetrics(counselorId, null);
    }

    /**
     * School-admin (信息化管理员) workspace metrics — system health & ops focus, NOT business KPI.
     *
     * <p>Three sections feed the AdminWorkspace UI:
     * <ul>
     *   <li><b>Pulse</b> — workflow throughput (7d), notification delivery (24h), daily active users</li>
     *   <li><b>Anomalies</b> — notification send failures (24h) + stuck workflows (running > 7d).
     *       Note: workflow_instance has no failed/timeout state, so "stuck" is the closest signal.</li>
     *   <li><b>My desk</b> — my workflow drafts + my recent audit-log actions (last 7d)</li>
     * </ul>
     */
    public Map<String, Object> collectForSchoolAdmin(Long userId) {
        String schema = schema();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scope", "school_admin");

        // A. Pulse — workflow throughput (7d), notification delivery (24h), daily activity
        m.put("workflow_completed_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".workflow_instance " +
                        "WHERE status = 'completed' AND started_at > NOW() - INTERVAL '7 days' " +
                        "  AND deleted_at IS NULL"));
        m.put("workflow_finished_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".workflow_instance " +
                        "WHERE status IN ('completed','rejected','cancelled') " +
                        "  AND started_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL"));

        m.put("notif_sent_24h", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".notification_recipient " +
                        "WHERE status = 'sent' AND created_at > NOW() - INTERVAL '24 hours'"));
        m.put("notif_total_24h", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".notification_recipient " +
                        "WHERE created_at > NOW() - INTERVAL '24 hours'"));

        m.put("today_active_users", countOrZero(
                "SELECT COUNT(DISTINCT user_id) FROM " + schema + ".audit_log " +
                        "WHERE user_id IS NOT NULL AND created_at::date = CURRENT_DATE"));

        // B. Anomalies — failed notifications + stuck workflows
        m.put("notif_failures_24h", listFailedNotifications(schema, 8));
        m.put("stuck_workflows", listStuckWorkflows(schema, 8));

        // C. My desk — drafts owned by me + my recent audit actions
        m.put("my_workflow_drafts", listMyWorkflowDrafts(schema, userId, 10));
        m.put("my_recent_audits", listMyRecentAudits(schema, userId, 12));

        return m;
    }

    /**
     * Class-scoped counselor metrics — same shape as {@link #collectForCounselor} but
     * restricted to a single class under the counselor's management. Used by the
     * workspace per-class "AI 观察员" drawer so multi-class counselors can drill
     * into one class at a time.
     *
     * <p>Enforces that the counselor actually manages {@code classId}; if not the
     * returned map has {@code access_denied=true} and no other metrics, so the
     * caller surfaces an empty state instead of leaking counts from another class.
     */
    public Map<String, Object> collectForCounselorClass(Long counselorId, Long classId) {
        if (classId == null) {
            return collectForCounselor(counselorId);
        }
        return collectCounselorMetrics(counselorId, classId);
    }

    private Map<String, Object> collectCounselorMetrics(Long counselorId, Long classId) {
        String schema = schema();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scope", classId == null ? "counselor" : "counselor_class");
        m.put("counselor_id", counselorId);

        List<Long> studentIds;
        if (classId == null) {
            studentIds = studentIdsOfCounselor(schema, counselorId);
        } else {
            Map<String, Object> classInfo = classInfoIfManaged(schema, counselorId, classId);
            if (classInfo == null) {
                m.put("access_denied", true);
                m.put("class_id", classId);
                return m;
            }
            m.put("class_id", classId);
            m.put("class_name", classInfo.get("class_name"));
            studentIds = studentIdsOfClass(schema, classId);
        }
        m.put("class_student_count", studentIds.size());
        if (studentIds.isEmpty()) {
            m.put("empty_class", true);
            return m;
        }
        String idList = joinIds(studentIds);

        m.put("leave_pending", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".leave_request " +
                        "WHERE status = 'pending' AND student_id IN (" + idList + ")"));
        m.put("leave_uncancelled_overdue", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".leave_request " +
                        "WHERE status = 'approved' AND cancel_time IS NULL " +
                        "  AND end_time < NOW() AND student_id IN (" + idList + ")"));

        m.put("alerts_open", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_alert " +
                        "WHERE status = 'open' AND student_id IN (" + idList + ")"));
        m.put("alerts_critical", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_alert " +
                        "WHERE status = 'open' AND severity = 'critical' AND student_id IN (" + idList + ")"));
        m.put("recent_alerts", recentAlerts(schema, idList, 8));

        m.put("violations_last_30d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'violation_recorded' " +
                        "  AND occurred_at > NOW() - INTERVAL '30 days' AND student_id IN (" + idList + ")"));
        m.put("checkin_late_last_7d", countOrZero(
                "SELECT COUNT(*) FROM " + schema + ".student_event_log " +
                        "WHERE event_type = 'checkin_late' AND occurred_at > NOW() - INTERVAL '7 days' " +
                        "  AND student_id IN (" + idList + ")"));

        m.put("notifications_in_progress", recentNotificationTasks(schema, counselorId, 6));
        m.put("collections_in_progress", recentCollectionForms(schema, counselorId, 6));

        return m;
    }

    // --- helpers ---

    private String schema() {
        String s = TenantContext.getSchemaName();
        if (s == null || s.isBlank() || !s.matches("[a-zA-Z0-9_]+")) {
            throw new IllegalStateException("schema not set or invalid: " + s);
        }
        return s;
    }

    private long countOrZero(String sql) {
        try {
            Long v = jdbc.queryForObject(sql, Long.class);
            return v == null ? 0L : v;
        } catch (Exception e) {
            log.warn("metric query failed: {} ({})", sql, e.getMessage());
            return 0L;
        }
    }

    private Map<String, Long> groupCount(String sql) {
        Map<String, Long> out = new HashMap<>();
        try {
            jdbc.query(sql, rs -> {
                out.put(rs.getString(1), rs.getLong(2));
            });
        } catch (Exception e) {
            log.warn("group metric query failed: {} ({})", sql, e.getMessage());
        }
        return out;
    }

    private List<Long> studentIdsOfCounselor(String schema, Long counselorId) {
        // counselor → org (class) via counselor_org_mapping → student_profile via class_id
        try {
            return jdbc.queryForList(
                    "SELECT sp.user_id FROM " + schema + ".student_profile sp " +
                            "JOIN " + schema + ".counselor_org_mapping m ON m.org_id = sp.class_id " +
                            "WHERE m.counselor_id = ? AND sp.status = 'active'",
                    Long.class, counselorId);
        } catch (Exception e) {
            log.warn("lookup students of counselor={} failed: {}", counselorId, e.getMessage());
            return List.of();
        }
    }

    /**
     * Returns class name if {@code counselorId} manages {@code classId} (directly or through
     * an ancestor org — same traversal as {@link com.xg.business.student.mapper.StudentProfileMapper#findRosterByCounselor}).
     * Returns {@code null} when unmanaged so the caller can emit {@code access_denied}.
     */
    private Map<String, Object> classInfoIfManaged(String schema, Long counselorId, Long classId) {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT o.name AS class_name " +
                            "FROM " + schema + ".org_unit o " +
                            "JOIN " + schema + ".org_closure oc ON oc.descendant_id = o.id " +
                            "JOIN " + schema + ".counselor_org_mapping m ON m.org_id = oc.ancestor_id " +
                            "WHERE o.id = ? AND m.counselor_id = ? AND o.deleted_at IS NULL " +
                            "LIMIT 1",
                    classId, counselorId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception e) {
            log.warn("classInfoIfManaged counselor={} class={} failed: {}", counselorId, classId, e.getMessage());
            return null;
        }
    }

    private List<Long> studentIdsOfClass(String schema, Long classId) {
        try {
            return jdbc.queryForList(
                    "SELECT user_id FROM " + schema + ".student_profile " +
                            "WHERE class_id = ? AND status = 'active'",
                    Long.class, classId);
        } catch (Exception e) {
            log.warn("lookup students of class={} failed: {}", classId, e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> recentAlerts(String schema, String studentFilter, int limit) {
        String filterClause = studentFilter == null || studentFilter.isBlank()
                ? ""
                : " AND sa.student_id IN (" + studentFilter + ")";
        String sql = "SELECT sa.id, sa.student_id, sa.severity, sa.rule_name, sa.created_at, " +
                "u.real_name AS student_name, sa.status " +
                "FROM " + schema + ".student_alert sa " +
                "JOIN " + schema + ".sys_user u ON u.id = sa.student_id " +
                "WHERE sa.status = 'open'" + filterClause + " " +
                "ORDER BY CASE sa.severity " +
                "  WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, " +
                "sa.created_at DESC LIMIT ?";
        try {
            return jdbc.queryForList(sql, limit);
        } catch (Exception e) {
            log.warn("recent alerts query failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Recent notifications with require_confirm=true that still have unconfirmed
     * recipients, for showing 催办 task progress in the AI observer.
     *
     * @param senderId when non-null restricts to notifications this counselor sent;
     *                 dean scope passes null to see all tenant notifications.
     */
    private List<Map<String, Object>> recentNotificationTasks(String schema, Long senderId, int limit) {
        String senderClause = senderId == null ? "" : " AND n.sender_id = ? ";
        String sql = "SELECT n.id, n.title, n.level, n.created_at, " +
                "COUNT(DISTINCT nr.user_id) AS total_recipients, " +
                "COUNT(DISTINCT CASE WHEN nr.confirmed THEN nr.user_id END) AS confirmed_recipients " +
                "FROM " + schema + ".notification n " +
                "JOIN " + schema + ".notification_recipient nr ON nr.notification_id = n.id " +
                "WHERE n.require_confirm = TRUE " +
                "  AND n.created_at > NOW() - INTERVAL '14 days' " +
                senderClause +
                "GROUP BY n.id, n.title, n.level, n.created_at " +
                "HAVING COUNT(DISTINCT CASE WHEN nr.confirmed THEN nr.user_id END) " +
                "       < COUNT(DISTINCT nr.user_id) " +
                "ORDER BY n.created_at DESC LIMIT ?";
        try {
            return senderId == null
                    ? jdbc.queryForList(sql, limit)
                    : jdbc.queryForList(sql, senderId, limit);
        } catch (Exception e) {
            log.warn("recent notification tasks failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Recent published collection forms that still have unfilled students in scope.
     * Submission totals join via the form's scope_org_ids expanded through org_closure
     * to the student_profile roster — same resolution as CollectionService.formProgress.
     *
     * @param creatorId when non-null restricts to forms created by this counselor.
     */
    private List<Map<String, Object>> recentCollectionForms(String schema, Long creatorId, int limit) {
        String creatorClause = creatorId == null ? "" : " AND f.creator_id = ? ";
        String sql = "SELECT f.id, f.title, f.deadline, f.created_at, " +
                "  (SELECT COUNT(DISTINCT sp.user_id) " +
                "   FROM " + schema + ".student_profile sp " +
                "   JOIN " + schema + ".org_closure oc ON oc.descendant_id = sp.class_id " +
                "   WHERE sp.status = 'active' AND oc.ancestor_id = ANY(f.scope_org_ids)) AS expected, " +
                "  (SELECT COUNT(*) FROM " + schema + ".collection_submission cs " +
                "   WHERE cs.form_id = f.id AND cs.deleted_at IS NULL) AS submitted " +
                "FROM " + schema + ".collection_form f " +
                "WHERE f.status = 'published' AND f.deleted_at IS NULL " +
                "  AND (f.deadline IS NULL OR f.deadline > NOW()) " +
                creatorClause +
                "ORDER BY f.deadline ASC NULLS LAST, f.created_at DESC LIMIT ?";
        try {
            List<Map<String, Object>> rows = creatorId == null
                    ? jdbc.queryForList(sql, limit)
                    : jdbc.queryForList(sql, creatorId, limit);
            // Drop fully-completed forms so the insight stays focused on 催办 targets.
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                long expected = asLong(r.get("expected"));
                long submitted = asLong(r.get("submitted"));
                if (expected > 0 && submitted < expected) out.add(r);
            }
            return out;
        } catch (Exception e) {
            log.warn("recent collection forms failed: {}", e.getMessage());
            return List.of();
        }
    }

    private long asLong(Object v) {
        if (v == null) return 0L;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return 0L; }
    }

    private List<Map<String, Object>> topCounselorWorkload(String schema, int limit) {
        String sql = "SELECT u.real_name AS name, COUNT(l.id) AS pending " +
                "FROM " + schema + ".sys_user u " +
                "JOIN " + schema + ".sys_user_role r ON u.id = r.user_id AND r.role_id = 2 " +
                "JOIN " + schema + ".counselor_org_mapping m ON m.counselor_id = u.id " +
                "JOIN " + schema + ".student_profile p ON p.class_id = m.org_id " +
                "LEFT JOIN " + schema + ".leave_request l ON l.student_id = p.user_id AND l.status = 'pending' " +
                "WHERE u.status = 'active' " +
                "GROUP BY u.id, u.real_name " +
                "ORDER BY pending DESC " +
                "LIMIT ?";
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(sql, limit);
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                out.add(Map.of("name", r.get("name"), "pending", r.get("pending")));
            }
            return out;
        } catch (Exception e) {
            log.warn("top counselor workload query failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> listFailedNotifications(String schema, int limit) {
        String sql = "SELECT nr.id, nr.notification_id, nr.user_id, nr.channel, nr.last_error, " +
                "       nr.retry_count, nr.created_at, " +
                "       n.title, u.real_name AS user_name " +
                "FROM " + schema + ".notification_recipient nr " +
                "JOIN " + schema + ".notification n ON n.id = nr.notification_id " +
                "LEFT JOIN " + schema + ".sys_user u ON u.id = nr.user_id " +
                "WHERE nr.status = 'failed' AND nr.created_at > NOW() - INTERVAL '24 hours' " +
                "ORDER BY nr.created_at DESC LIMIT ?";
        try {
            return jdbc.queryForList(sql, limit);
        } catch (Exception e) {
            log.warn("listFailedNotifications failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> listStuckWorkflows(String schema, int limit) {
        String sql = "SELECT wi.id, wi.biz_type, wi.biz_id, wi.current_node_id, wi.started_at, " +
                "       wi.initiator_id, u.real_name AS initiator_name, wd.name AS definition_name " +
                "FROM " + schema + ".workflow_instance wi " +
                "LEFT JOIN " + schema + ".workflow_definition wd ON wd.id = wi.definition_id " +
                "LEFT JOIN " + schema + ".sys_user u ON u.id = wi.initiator_id " +
                "WHERE wi.status = 'running' AND wi.started_at < NOW() - INTERVAL '7 days' " +
                "  AND wi.deleted_at IS NULL " +
                "ORDER BY wi.started_at ASC LIMIT ?";
        try {
            return jdbc.queryForList(sql, limit);
        } catch (Exception e) {
            log.warn("listStuckWorkflows failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> listMyWorkflowDrafts(String schema, Long userId, int limit) {
        if (userId == null) return List.of();
        String sql = "SELECT id, name, module, version, updated_at " +
                "FROM " + schema + ".workflow_definition " +
                "WHERE status = 'draft' AND updated_by = ? AND deleted_at IS NULL " +
                "ORDER BY updated_at DESC LIMIT ?";
        try {
            return jdbc.queryForList(sql, userId, limit);
        } catch (Exception e) {
            log.warn("listMyWorkflowDrafts failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> listMyRecentAudits(String schema, Long userId, int limit) {
        if (userId == null) return List.of();
        String sql = "SELECT id, action, module, target_type, target_id, description, created_at " +
                "FROM " + schema + ".audit_log " +
                "WHERE user_id = ? AND created_at > NOW() - INTERVAL '7 days' " +
                "ORDER BY created_at DESC LIMIT ?";
        try {
            return jdbc.queryForList(sql, userId, limit);
        } catch (Exception e) {
            log.warn("listMyRecentAudits failed: {}", e.getMessage());
            return List.of();
        }
    }

    private String joinIds(List<Long> ids) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(ids.get(i));
        }
        return sb.toString();
    }
}
