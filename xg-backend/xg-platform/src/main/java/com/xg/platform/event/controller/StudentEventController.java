package com.xg.platform.event.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.mapper.StudentEventLogMapper;
import com.xg.platform.event.model.StudentEventLog;
import com.xg.platform.event.scheduler.NotificationUnconfirmedScanScheduler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class StudentEventController {

    private final StudentEventLogMapper mapper;
    private final NotificationUnconfirmedScanScheduler notificationUnconfirmedScanScheduler;
    private final JdbcTemplate jdbc;

    @GetMapping("/api/v1/students/{studentId}/events")
    public R<PageResult<StudentEventLog>> list(
            @PathVariable Long studentId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Integer minSeverity) {

        Page<StudentEventLog> p = new Page<>(page, Math.min(size, 100));
        LambdaQueryWrapper<StudentEventLog> wrapper = new LambdaQueryWrapper<StudentEventLog>()
                .eq(StudentEventLog::getStudentId, studentId)
                .eq(eventType != null && !eventType.isBlank(), StudentEventLog::getEventType, eventType)
                .ge(minSeverity != null, StudentEventLog::getSeverity, minSeverity)
                .orderByDesc(StudentEventLog::getOccurredAt);
        return R.ok(PageResult.of(mapper.selectPage(p, wrapper)));
    }

    @PostMapping("/api/v1/events/scan/notification-unconfirmed")
    public R<Map<String, Object>> triggerNotificationUnconfirmedScan() {
        int emitted = notificationUnconfirmedScanScheduler.runOnce("manual");
        return R.ok(Map.of("emitted", emitted));
    }

    @GetMapping("/api/v1/student-stats/top-late")
    public R<List<Map<String, Object>>> topLate(
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "10") int limit,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (userId == null || userId.isBlank()) return R.ok(List.of());
        int safeDays = Math.max(1, Math.min(days, 90));
        int safeLimit = Math.max(1, Math.min(limit, 50));
        Long counselorId;
        try {
            counselorId = Long.valueOf(userId);
        } catch (NumberFormatException e) {
            return R.ok(List.of());
        }
        String schema = TenantContext.getSchemaName();
        if (schema == null || !schema.matches("[a-zA-Z0-9_]+")) return R.ok(List.of());
        String sql = "SELECT sp.user_id AS student_id, u.real_name AS student_name, sp.class_id AS class_id, COUNT(e.id) AS late_count "
                + "FROM " + schema + ".student_event_log e "
                + "JOIN " + schema + ".student_profile sp ON e.student_id = sp.user_id "
                + "JOIN " + schema + ".sys_user u ON u.id = sp.user_id "
                + "JOIN " + schema + ".counselor_org_mapping m ON m.org_id = sp.class_id "
                + "WHERE e.event_type = 'checkin_late' "
                + "  AND e.occurred_at > NOW() - make_interval(days => ?) "
                + "  AND m.counselor_id = ? AND sp.status = 'active' "
                + "GROUP BY sp.user_id, u.real_name, sp.class_id "
                + "ORDER BY late_count DESC LIMIT ?";
        List<Map<String, Object>> rows = jdbc.queryForList(sql, safeDays, counselorId, safeLimit);
        return R.ok(rows);
    }
}
