package com.xg.business.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.academic.mapper.AcademicTermMapper;
import com.xg.business.academic.model.AcademicTerm;
import com.xg.business.checkin.mapper.CheckinRecordMapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.service.LeaveGlobalConfigService;
import com.xg.business.violation.mapper.ViolationRecordMapper;
import com.xg.business.workflow.vo.ApplicantStats;
import com.xg.business.workflow.vo.PendingTaskVO;
import com.xg.platform.alert.mapper.StudentAlertMapper;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Enriches a batch of pending workflow tasks with the originator's risk profile so the
 * workspace can short-circuit obviously-low-risk approvals into a single button.
 *
 * <p>Scoring rules (see PM spec under CLAUDE.md):
 * <ul>
 *   <li><b>high</b>: any unpunished violation, high/critical open alert, ≥1 absent in 30d,
 *       or leave duration &gt; 7 days</li>
 *   <li><b>medium</b>: ≥3 leaves in 30d, 4–7 day leave, or open medium/low alert</li>
 *   <li><b>low</b>: everything else</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PendingTaskEnricher {

    private static final int ABSENT_WINDOW_DAYS = 30;
    private static final int LEAVE_WINDOW_DAYS = 30;
    private static final int VIOLATION_WINDOW_DAYS = 90;

    private final WorkflowInstanceMapper instanceMapper;
    private final SysUserMapper sysUserMapper;
    private final LeaveRequestMapper leaveRequestMapper;
    private final CheckinRecordMapper checkinRecordMapper;
    private final ViolationRecordMapper violationRecordMapper;
    private final StudentAlertMapper studentAlertMapper;
    private final AcademicTermMapper academicTermMapper;
    private final LeaveGlobalConfigService leaveGlobalConfigService;

    public List<PendingTaskVO> enrich(List<TaskInstance> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Long> instanceIds = tasks.stream()
                .map(TaskInstance::getWorkflowInstanceId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, WorkflowInstance> instanceMap = batchFetchInstances(instanceIds);

        Set<Long> leaveBizIds = tasks.stream()
                .map(t -> instanceMap.get(t.getWorkflowInstanceId()))
                .filter(java.util.Objects::nonNull)
                .filter(inst -> "leave".equals(inst.getBizType()) && inst.getBizId() != null)
                .map(WorkflowInstance::getBizId)
                .collect(Collectors.toSet());
        Map<Long, LeaveRequest> leaveMap = batchFetchLeaves(leaveBizIds);

        Set<Long> studentIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (TaskInstance t : tasks) {
            WorkflowInstance inst = instanceMap.get(t.getWorkflowInstanceId());
            if (inst == null) continue;
            if (inst.getInitiatorId() != null) {
                userIds.add(inst.getInitiatorId());
            }
            Long studentId = resolveStudentId(inst, leaveMap);
            if (studentId != null) {
                studentIds.add(studentId);
            }
        }

        Map<Long, String> userNameMap = batchFetchUserNames(userIds);
        Map<Long, ApplicantStats> statsMap = aggregateStats(studentIds);
        // 全局学期累计上限作为新的 high 触发条件:批量拉每个学生本学期累计天数,
        // 跟 LeaveGlobalConfig.term_max_days 比较。无 is_current 学期 / cap=null 时
        // termAccumulated 是空 map,scoreRisk 看到 cap==null 会跳过这条规则。
        BigDecimal termCap = leaveGlobalConfigService.getTermMaxDays();
        Map<Long, BigDecimal> termAccumulated = batchFetchTermAccumulated(studentIds, termCap);

        List<PendingTaskVO> result = new ArrayList<>(tasks.size());
        for (TaskInstance t : tasks) {
            WorkflowInstance inst = instanceMap.get(t.getWorkflowInstanceId());
            result.add(buildVO(t, inst, leaveMap, userNameMap, statsMap, termCap, termAccumulated));
        }
        return result;
    }

    private PendingTaskVO buildVO(TaskInstance t,
                                   WorkflowInstance inst,
                                   Map<Long, LeaveRequest> leaveMap,
                                   Map<Long, String> userNameMap,
                                   Map<Long, ApplicantStats> statsMap,
                                   BigDecimal termCap,
                                   Map<Long, BigDecimal> termAccumulated) {
        PendingTaskVO vo = new PendingTaskVO();
        vo.setId(t.getId());
        vo.setWorkflowInstanceId(t.getWorkflowInstanceId());
        vo.setNodeId(t.getNodeId());
        vo.setNodeName(t.getNodeName());
        vo.setAssigneeId(t.getAssigneeId());
        vo.setDueAt(t.getDueAt());
        vo.setAssignedAt(t.getAssignedAt());

        if (inst != null) {
            vo.setBizType(inst.getBizType());
            vo.setBizId(inst.getBizId());
            vo.setInitiatorId(inst.getInitiatorId());
            vo.setStartedAt(inst.getStartedAt());
            if (inst.getInitiatorId() != null) {
                vo.setInitiatorName(userNameMap.get(inst.getInitiatorId()));
            }
        }

        LeaveRequest leave = null;
        if (inst != null && "leave".equals(inst.getBizType()) && inst.getBizId() != null) {
            leave = leaveMap.get(inst.getBizId());
            if (leave != null) {
                vo.setLeaveDurationDays(leave.getDurationDays());
                vo.setLeaveTypeName(leave.getLeaveTypeName());
                vo.setLeaveReason(leave.getReason());
                vo.setLeaveStartTime(leave.getStartTime());
                vo.setLeaveEndTime(leave.getEndTime());
                if (leave.getStudentName() != null) {
                    vo.setInitiatorName(leave.getStudentName());
                }
            }
        }

        Long studentId = resolveStudentId(inst, leaveMap);
        ApplicantStats stats = studentId == null ? new ApplicantStats() : statsMap.getOrDefault(studentId, new ApplicantStats());
        vo.setApplicantStats(stats);

        BigDecimal accumulated = studentId == null ? null : termAccumulated.get(studentId);
        RiskAssessment assessment = scoreRisk(stats, leave, termCap, accumulated);
        vo.setRiskLevel(assessment.level);
        vo.setReasons(assessment.reasons);
        return vo;
    }

    private Long resolveStudentId(WorkflowInstance inst, Map<Long, LeaveRequest> leaveMap) {
        if (inst == null) return null;
        if ("leave".equals(inst.getBizType()) && inst.getBizId() != null) {
            LeaveRequest leave = leaveMap.get(inst.getBizId());
            if (leave != null) return leave.getStudentId();
        }
        return inst.getInitiatorId();
    }

    private Map<Long, WorkflowInstance> batchFetchInstances(Collection<Long> ids) {
        if (ids.isEmpty()) return Collections.emptyMap();
        List<WorkflowInstance> list = instanceMapper.selectBatchIds(ids);
        Map<Long, WorkflowInstance> map = new HashMap<>();
        for (WorkflowInstance w : list) map.put(w.getId(), w);
        return map;
    }

    private Map<Long, LeaveRequest> batchFetchLeaves(Collection<Long> ids) {
        if (ids.isEmpty()) return Collections.emptyMap();
        List<LeaveRequest> list = leaveRequestMapper.selectBatchIds(ids);
        Map<Long, LeaveRequest> map = new HashMap<>();
        for (LeaveRequest l : list) map.put(l.getId(), l);
        return map;
    }

    private Map<Long, String> batchFetchUserNames(Collection<Long> ids) {
        if (ids.isEmpty()) return Collections.emptyMap();
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getId, ids)
                        .select(SysUser::getId, SysUser::getRealName, SysUser::getUsername));
        Map<Long, String> map = new HashMap<>();
        for (SysUser u : users) {
            String name = u.getRealName() != null && !u.getRealName().isBlank() ? u.getRealName() : u.getUsername();
            map.put(u.getId(), name);
        }
        return map;
    }

    private Map<Long, ApplicantStats> aggregateStats(Set<Long> studentIds) {
        if (studentIds.isEmpty()) return Collections.emptyMap();
        List<Long> ids = new ArrayList<>(studentIds);
        Map<Long, ApplicantStats> map = new HashMap<>();
        for (Long id : ids) map.put(id, new ApplicantStats());

        for (Map<String, Object> row : checkinRecordMapper.countAbsentByStudents(ids, ABSENT_WINDOW_DAYS)) {
            Long sid = toLong(row.get("student_id"));
            int cnt = toInt(row.get("cnt"));
            if (sid != null) map.computeIfAbsent(sid, k -> new ApplicantStats()).setAbsent30d(cnt);
        }
        for (Map<String, Object> row : leaveRequestMapper.countLeaveByStudents(ids, LEAVE_WINDOW_DAYS)) {
            Long sid = toLong(row.get("student_id"));
            int cnt = toInt(row.get("cnt"));
            if (sid != null) map.computeIfAbsent(sid, k -> new ApplicantStats()).setLeaveCount30d(cnt);
        }
        for (Map<String, Object> row : violationRecordMapper.aggregateByStudents(ids, VIOLATION_WINDOW_DAYS)) {
            Long sid = toLong(row.get("student_id"));
            if (sid == null) continue;
            ApplicantStats s = map.computeIfAbsent(sid, k -> new ApplicantStats());
            s.setUnpunishedViolations(toInt(row.get("unpunished")));
            s.setViolation90d(toInt(row.get("recent")));
        }
        for (Map<String, Object> row : studentAlertMapper.countOpenBySeverity(ids)) {
            Long sid = toLong(row.get("student_id"));
            if (sid == null) continue;
            String sev = (String) row.get("severity");
            int cnt = toInt(row.get("cnt"));
            ApplicantStats s = map.computeIfAbsent(sid, k -> new ApplicantStats());
            switch (sev == null ? "" : sev) {
                case "critical" -> s.setOpenAlertsCritical(cnt);
                case "high" -> s.setOpenAlertsHigh(cnt);
                case "medium" -> s.setOpenAlertsMedium(cnt);
                case "low" -> s.setOpenAlertsLow(cnt);
                default -> { /* ignore */ }
            }
        }
        return map;
    }

    private RiskAssessment scoreRisk(ApplicantStats stats, LeaveRequest leave,
                                      BigDecimal termCap, BigDecimal termAccumulated) {
        List<String> reasons = new ArrayList<>();
        boolean high = false;
        boolean medium = false;

        if (stats.getUnpunishedViolations() > 0) {
            reasons.add("有" + stats.getUnpunishedViolations() + "条未处理违纪");
            high = true;
        }
        if (stats.getOpenAlertsCritical() > 0) {
            reasons.add("有" + stats.getOpenAlertsCritical() + "条 critical 预警");
            high = true;
        }
        if (stats.getOpenAlertsHigh() > 0) {
            reasons.add("有" + stats.getOpenAlertsHigh() + "条 high 预警");
            high = true;
        }
        if (stats.getAbsent30d() > 0) {
            reasons.add("近30天旷课" + stats.getAbsent30d() + "次");
            high = true;
        }
        if (leave != null && leave.getDurationDays() != null
                && leave.getDurationDays().compareTo(new BigDecimal("7")) > 0) {
            reasons.add("本次请假" + leave.getDurationDays() + "天");
            high = true;
        }
        // 全局学期累计上限触发的高风险:仅在配置了 cap 且累计 > cap 时点亮。
        // accumulated 已经把当前 pending 这条算进去了(状态 in {pending, approved}),
        // 所以审批人在 drawer 里看到的"已累计"包括正在审的这一条。
        if (termCap != null && termAccumulated != null
                && termAccumulated.compareTo(termCap) > 0) {
            reasons.add("本学期累计请假已达 " + stripTrailingZeros(termAccumulated)
                    + " 天,超出全局上限 " + stripTrailingZeros(termCap) + " 天");
            high = true;
        }

        if (!high) {
            if (stats.getLeaveCount30d() >= 3) {
                reasons.add("近30天已请假" + stats.getLeaveCount30d() + "次");
                medium = true;
            }
            if (leave != null && leave.getDurationDays() != null
                    && leave.getDurationDays().compareTo(new BigDecimal("4")) >= 0
                    && leave.getDurationDays().compareTo(new BigDecimal("7")) <= 0) {
                reasons.add("本次请假" + leave.getDurationDays() + "天");
                medium = true;
            }
            if (stats.getOpenAlertsMedium() > 0 || stats.getOpenAlertsLow() > 0) {
                reasons.add("有" + (stats.getOpenAlertsMedium() + stats.getOpenAlertsLow()) + "条低等级预警");
                medium = true;
            }
        }

        String level = high ? "high" : (medium ? "medium" : "low");
        if (reasons.isEmpty()) {
            reasons.add("历史记录良好");
        }
        return new RiskAssessment(level, reasons);
    }

    /**
     * 一次性拉齐 studentIds 在当前学期内的累计请假天数,空学期/空 cap 时返空 map。
     * 累计窗口与 LeaveService.getTermUsage 保持一致(start_time 落在 is_current 学期 +
     * status ∈ {pending, approved})。
     */
    private Map<Long, BigDecimal> batchFetchTermAccumulated(Set<Long> studentIds, BigDecimal termCap) {
        if (termCap == null || studentIds.isEmpty()) return Collections.emptyMap();
        AcademicTerm term = academicTermMapper.selectOne(
                new LambdaQueryWrapper<AcademicTerm>()
                        .eq(AcademicTerm::getIsCurrent, true)
                        .last("LIMIT 1"));
        if (term == null || term.getStartDate() == null || term.getEndDate() == null) {
            return Collections.emptyMap();
        }
        List<Map<String, Object>> rows = leaveRequestMapper.sumTermDaysByStudents(
                new ArrayList<>(studentIds), term.getStartDate(), term.getEndDate());
        Map<Long, BigDecimal> map = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Long sid = toLong(row.get("student_id"));
            Object total = row.get("total");
            if (sid == null || total == null) continue;
            map.put(sid, total instanceof BigDecimal bd ? bd : new BigDecimal(total.toString()));
        }
        return map;
    }

    private static String stripTrailingZeros(BigDecimal v) {
        if (v == null) return "0";
        return v.stripTrailingZeros().toPlainString();
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static int toInt(Object v) {
        if (v == null) return 0;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private record RiskAssessment(String level, List<String> reasons) { }
}
