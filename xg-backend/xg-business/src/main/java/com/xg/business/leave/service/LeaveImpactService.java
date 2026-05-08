package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.business.academic.model.ClassSchedule;
import com.xg.business.academic.service.AcademicTermService;
import com.xg.business.academic.service.ClassScheduleService;
import com.xg.business.leave.dto.LeaveImpactView;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.xg.common.exception.BizException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 计算"请假会耽误几节课"——辅导员审批时的辅助决策信息。
 *
 * 流程：
 *   1. 从 LeaveRequest 取 student_id / start_time / end_time
 *   2. student_profile → class_id
 *   3. AcademicTerm.getCurrent() 取当前学期；用 start_date 做周次基准
 *   4. ClassSchedule for (class_id, term_code) → 反序列化 entries JSONB
 *   5. 遍历请假区间内每一天：
 *      - 算 day_of_week（ISO 1-7）
 *      - 算 week_index = (date - term.start_date) / 7 + 1
 *      - 命中条件：entry.day_of_week == 当日 && entry.weeks 包含 week_index
 *      - 累加 (end_period - start_period + 1) 节
 *
 * 任何环节缺数据（无课表 / 学生无班级 / 没当前学期）都返回 zero 视图，
 * 不抛错——UI 用 totalPeriods === 0 判定空态即可。
 *
 * 时区：leave 的 OffsetDateTime 转 LocalDate 时统一用应用时区（亚洲/上海，
 * 见 application.yml time-zone: Asia/Shanghai），避免凌晨请假被误判到前一天。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveImpactService {

    private static final ZoneId APP_ZONE = ZoneId.of("Asia/Shanghai");
    /** 兜底：极端长假超过 30 天就只算前 30 天，防 schedule entries 暴量
     *  被遍历——业务上 30 天封顶请假，正常不会触发。 */
    private static final int MAX_DAYS = 30;

    private final LeaveService leaveService;
    private final StudentProfileMapper studentProfileMapper;
    private final AcademicTermService termService;
    private final ClassScheduleService scheduleService;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    public LeaveImpactView compute(Long leaveId) {
        LeaveRequest leave = leaveService.getDetail(leaveId);
        if (leave == null) return new LeaveImpactView();
        return computeFor(leave.getStudentId(), leave.getStartTime(), leave.getEndTime());
    }

    /**
     * 学生填表时的预览 — 不依赖 leave_request id,直接用三参数算。同一套
     * 算法、同一个 view shape,UI 渲染逻辑跟审批时通用。
     */
    public LeaveImpactView computeFor(Long studentId, OffsetDateTime startTime, OffsetDateTime endTime) {
        LeaveImpactView view = new LeaveImpactView();
        // 租户级开关:管理员关掉 → 学生填表 / 辅导员审批都拿不到课程影响
        if (!isImpactEnabled()) return view;
        if (studentId == null || startTime == null || endTime == null) return view;

        // student → class_id
        StudentProfile student = studentProfileMapper.selectOne(
                new LambdaQueryWrapper<StudentProfile>()
                        .eq(StudentProfile::getUserId, studentId)
                        .last("LIMIT 1"));
        Long classId = (student == null) ? null : student.getClassId();
        if (classId == null) return view;

        // current term;无当前学期就空
        AcademicTerm term = termService.getCurrent();
        if (term == null || term.getStartDate() == null) return view;
        view.setTermCode(term.getCode());

        ClassSchedule schedule = scheduleService.getByClassAndTerm(classId, term.getCode());
        if (schedule == null) return view;

        List<Map<String, Object>> entries;
        try {
            String raw = schedule.getEntries();
            if (raw == null || raw.isBlank()) return view;
            entries = objectMapper.readValue(raw, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse class_schedule.entries for class {} term {}: {}",
                    classId, term.getCode(), e.getMessage());
            return view;
        }
        if (entries.isEmpty()) return view;

        LocalDate startDate = startTime.atZoneSameInstant(APP_ZONE).toLocalDate();
        LocalDate endDate = endTime.atZoneSameInstant(APP_ZONE).toLocalDate();
        if (endDate.isBefore(startDate)) return view;

        Set<String> seenCourses = new HashSet<>();
        int totalPeriods = 0;
        LocalDate cursor = startDate;
        int daysWalked = 0;
        while (!cursor.isAfter(endDate) && daysWalked < MAX_DAYS) {
            int isoDay = cursor.getDayOfWeek().getValue();   // 1=Mon..7=Sun
            int weekIndex = (int) ((cursor.toEpochDay() - term.getStartDate().toEpochDay()) / 7) + 1;

            LeaveImpactView.DayImpact dayImpact = new LeaveImpactView.DayImpact();
            dayImpact.setDate(cursor);
            dayImpact.setDayOfWeek(isoDay);
            dayImpact.setWeek(weekIndex);

            for (Map<String, Object> e : entries) {
                Integer entryDow = asInt(e.get("day_of_week"));
                if (entryDow == null || entryDow != isoDay) continue;

                List<Integer> weeks = asIntList(e.get("weeks"));
                if (weeks == null || !weeks.contains(weekIndex)) continue;

                LeaveImpactView.CourseSlot slot = new LeaveImpactView.CourseSlot();
                slot.setCourseName(asString(e.get("course_name")));
                slot.setTeacher(asString(e.get("teacher")));
                slot.setLocation(asString(e.get("location")));
                Integer sp = asInt(e.get("start_period"));
                Integer ep = asInt(e.get("end_period"));
                slot.setStartPeriod(sp == null ? 0 : sp);
                slot.setEndPeriod(ep == null ? slot.getStartPeriod() : ep);
                slot.setColor(asString(e.get("color")));

                dayImpact.getCourses().add(slot);
                if (slot.getCourseName() != null) seenCourses.add(slot.getCourseName());
                totalPeriods += Math.max(0, slot.getEndPeriod() - slot.getStartPeriod() + 1);
            }

            if (!dayImpact.getCourses().isEmpty()) {
                view.getByDay().add(dayImpact);
            }
            cursor = cursor.plusDays(1);
            daysWalked++;
        }

        view.setTotalPeriods(totalPeriods);
        view.setTotalCourses(seenCourses.size());
        view.setTotalDays(view.getByDay().size());
        return view;
    }

    /* ── 租户级"请假影响课程"开关 ──────────────────
     * 存在 public.tenant.config jsonb 的 leaveImpactEnabled 键,缺失默认 true。
     * 关掉后 computeFor / compute 都返 zero,UI 自动按 totalPeriods===0 判空隐藏。 */

    public boolean isImpactEnabled() {
        try {
            String json = jdbc.queryForObject(
                    "SELECT config::text FROM public.tenant WHERE id = ?",
                    String.class, currentTenantId());
            if (json == null || json.isBlank()) return true;
            @SuppressWarnings("unchecked")
            Map<String, Object> cfg = objectMapper.readValue(json, Map.class);
            Object v = cfg.get("leaveImpactEnabled");
            return !(v instanceof Boolean) || (Boolean) v;  // 缺失或非 boolean 默认 true
        } catch (EmptyResultDataAccessException e) {
            return true;
        } catch (Exception e) {
            log.warn("Failed to read leaveImpactEnabled, default to true: {}", e.getMessage());
            return true;
        }
    }

    @Transactional
    public boolean setImpactEnabled(boolean enabled) {
        String tenantId = currentTenantId();
        try {
            int affected = jdbc.update("""
                    UPDATE public.tenant
                       SET config = jsonb_set(COALESCE(config, '{}'::jsonb),
                                              '{leaveImpactEnabled}',
                                              ?::jsonb,
                                              true),
                           updated_at = NOW()
                     WHERE id = ?
                    """, String.valueOf(enabled), tenantId);
            if (affected == 0) throw new BizException("TENANT_NOT_FOUND", "租户不存在");
            log.info("Set leaveImpactEnabled={} for tenant {}", enabled, tenantId);
            return enabled;
        } catch (BizException biz) {
            throw biz;
        } catch (Exception e) {
            log.error("Failed to set leaveImpactEnabled: {}", e.getMessage(), e);
            throw new BizException("LEAVE_IMPACT_CONFIG_WRITE_FAILED",
                    "保存请假影响课程配置失败:" + e.getMessage());
        }
    }

    private String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }

    /* ── Jackson type-coercion helpers (entries 是 Map<String,Object>，
     *    JSON 数字进来可能是 Integer / Long / Double，需要安全降回 int) ── */

    private static Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        if (v instanceof JsonNode j && j.isNumber()) return j.intValue();
        try { return Integer.parseInt(v.toString()); } catch (Exception ex) { return null; }
    }

    private static String asString(Object v) {
        return v == null ? null : v.toString();
    }

    @SuppressWarnings("unchecked")
    private static List<Integer> asIntList(Object v) {
        if (v == null) return null;
        if (v instanceof List<?> raw) {
            return raw.stream().map(LeaveImpactService::asInt).toList();
        }
        return null;
    }
}
