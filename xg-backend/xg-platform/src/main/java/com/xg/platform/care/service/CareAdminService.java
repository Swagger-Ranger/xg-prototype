package com.xg.platform.care.service;

import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.care.dto.CareDrillRequest;
import com.xg.platform.care.error.CareTaskErrorCode;
import com.xg.platform.care.mapper.CareAdminQueryMapper;
import com.xg.platform.care.mapper.CareTaskAuditMapper;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.model.CareTaskAudit;
import com.xg.platform.care.rule.CareRuleCatalog;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 院系/学校管理视图（PRD §5.2 / §6.2 / §13.2）。范围按<b>角色</b>而非组织：
 * P0 dean / school_admin / 学工部部长都看本校全部（整租户），本院收窄留 P1。
 * 不通过前端传 scope —— 角色一律服务端从 Sa-Token 读。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareAdminService {

    private static final int TREND_DEFAULT_DAYS = 84;   // 约 12 周折线
    private static final int DRILL_LOOKBACK_DAYS = 90;  // PRD §5.3 近 90 天

    private final CareAdminQueryMapper adminMapper;
    private final CareTaskMapper careTaskMapper;
    private final CareTaskAuditMapper careTaskAuditMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    // ─────────────────── 汇总 / 超期 / 趋势 ───────────────────

    public Map<String, Object> summary() {
        requireManager();
        String t = TenantContext.getTenantId();
        OffsetDateTime weekStart = CareWeekRange.weekStart(OffsetDateTime.now());

        Map<String, Object> counts = adminMapper.summaryCounts(t, weekStart);

        List<Map<String, Object>> top = new ArrayList<>();
        for (Map<String, Object> r : adminMapper.topRules(t, weekStart, 3)) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("rule", ruleName((String) r.get("rule_id")));
            e.put("count", asInt(r.get("cnt")));
            top.add(e);
        }

        List<Map<String, Object>> sev = new ArrayList<>();
        for (Map<String, Object> r : adminMapper.severityDist(t, weekStart)) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("severity", r.get("severity"));
            e.put("count", asInt(r.get("cnt")));
            sev.add(e);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("week_total", asInt(counts.get("total")));
        out.put("done", asInt(counts.get("done")));
        out.put("in_progress", asInt(counts.get("in_progress")));
        out.put("overdue", asInt(counts.get("overdue")));
        out.put("top_rules", top);
        out.put("severity_dist", sev);
        return out;
    }

    public Map<String, Object> overdue(int page, int size) {
        requireManager();
        String t = TenantContext.getTenantId();
        int p = Math.max(1, page);
        int s = Math.min(Math.max(1, size), 100);
        long total = adminMapper.countOverdue(t);
        List<Map<String, Object>> items = adminMapper.overduePage(t, (p - 1) * s, s);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("items", items);   // 已不含责任辅导员（PRD §5.2）
        return out;
    }

    public Map<String, Object> trends(Integer days) {
        requireManager();
        String t = TenantContext.getTenantId();
        int d = (days == null || days <= 0) ? TREND_DEFAULT_DAYS : days;
        OffsetDateTime since = OffsetDateTime.now().minusDays(d);

        // rule_id → (week_start → count)，再展平为前端折线序列（用中文名，不泄 rule_id）
        Map<String, Map<String, Object>> byRule = new LinkedHashMap<>();
        for (Map<String, Object> r : adminMapper.trends(t, since)) {
            String name = ruleName((String) r.get("rule_id"));
            byRule.computeIfAbsent(name, k -> new LinkedHashMap<>())
                    .put(String.valueOf(r.get("week_start")), asInt(r.get("cnt")));
        }
        List<Map<String, Object>> series = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> e : byRule.entrySet()) {
            List<Map<String, Object>> points = new ArrayList<>();
            for (Map.Entry<String, Object> p : e.getValue().entrySet()) {
                Map<String, Object> pt = new LinkedHashMap<>();
                pt.put("week_start", p.getKey());
                pt.put("count", p.getValue());
                points.add(pt);
            }
            Map<String, Object> ser = new LinkedHashMap<>();
            ser.put("rule", e.getKey());
            ser.put("points", points);
            series.add(ser);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("since", since.toString());
        out.put("series", series);
        return out;
    }

    // ─────────────────── 督办 ───────────────────

    @Transactional
    public void urge(Long taskId) {
        List<String> roles = requireManager();
        CareTask task = careTaskMapper.selectById(taskId);
        if (task == null) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_NOT_FOUND);
        }
        // 通知铁律：走 Orchestrator + 模板（care_task_urge），责任辅导员经 applicant slot
        notificationOrchestrator.send(CareNotifyPolicy.URGE, "care_task", task.getId(),
                RecipientContext.applicant(task.getAssignedTo()), Map.of());
        writeAudit(task.getId(), "urged", task.getStatus(), task.getStatus(),
                CareAdminAccess.actorRole(roles),
                Map.of("task_id", String.valueOf(task.getId())));
    }

    // ─────────────────── 下钻 ───────────────────

    @Transactional
    public Map<String, Object> drillDown(Long studentId, CareDrillRequest req) {
        List<String> roles = requireManager();
        int limit = CareAdminAccess.drillDailyLimit(roles);
        Long actor = CurrentUser.id();
        String t = TenantContext.getTenantId();

        int used = adminMapper.countDrillToday(t, actor,
                CareWeekRange.dayStart(OffsetDateTime.now()));
        if (limit != CareAdminAccess.DRILL_UNLIMITED && used >= limit) {
            throw new BizException(CareTaskErrorCode.CARE_DRILL_QUOTA_EXCEEDED);
        }

        // task_id 为空：学生级下钻审计（PRD §13.1 task_id 可空）
        writeAudit(null, "drilled_down", null, null,
                CareAdminAccess.actorRole(roles),
                Map.of("student_id", String.valueOf(studentId), "reason", req.getReason()));

        OffsetDateTime since = OffsetDateTime.now().minusDays(DRILL_LOOKBACK_DAYS);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("student_id", studentId);
        out.put("tasks", adminMapper.drilledStudentTasks(t, studentId, since));
        out.put("audit", adminMapper.drilledStudentAudit(t, studentId, since));

        Map<String, Object> quota = new LinkedHashMap<>();
        int usedAfter = used + 1;
        boolean unlimited = limit == CareAdminAccess.DRILL_UNLIMITED;
        quota.put("used", usedAfter);
        quota.put("limit", unlimited ? null : limit);
        // 达 90% 提示（PRD §13.2）；不限频角色不提示
        quota.put("near_limit", !unlimited && usedAfter >= limit * 0.9);
        out.put("quota", quota);
        return out;
    }

    public Map<String, Object> drillLog(int page, int size) {
        requireManager();
        String t = TenantContext.getTenantId();
        int p = Math.max(1, page);
        int s = Math.min(Math.max(1, size), 100);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", adminMapper.countDrillLog(t));
        out.put("items", adminMapper.drillLogPage(t, (p - 1) * s, s));
        return out;
    }

    // ─────────────────── helpers ───────────────────

    /** 服务端角色闸：非管理角色一律 403 文案。返回 roles 供配额/审计复用。 */
    private List<String> requireManager() {
        List<String> roles = CareAdminAccess.currentRoles();
        if (!CareAdminAccess.isManager(roles)) {
            throw new BizException(CareTaskErrorCode.CARE_ADMIN_FORBIDDEN);
        }
        return roles;
    }

    private void writeAudit(Long taskId, String action, String fromStatus,
                            String toStatus, String actorRole,
                            Map<String, Object> payload) {
        CareTaskAudit a = new CareTaskAudit();
        a.setTenantId(TenantContext.getTenantId());
        a.setTaskId(taskId);
        a.setAction(action);
        a.setFromStatus(fromStatus);
        a.setToStatus(toStatus);
        a.setActorId(CurrentUser.idOrNull());
        a.setActorRole(actorRole);
        a.setPayload(payload);
        a.setCreatedAt(OffsetDateTime.now());
        careTaskAuditMapper.insert(a);
    }

    private static String ruleName(String ruleId) {
        return CareRuleCatalog.findById(ruleId).map(r -> r.name()).orElse(ruleId);
    }

    private static int asInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(o.toString());
    }
}
