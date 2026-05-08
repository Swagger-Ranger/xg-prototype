package com.xg.business.workflow.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.workflow.service.PendingTaskEnricher;
import com.xg.business.workflow.vo.ApplicantStats;
import com.xg.business.workflow.vo.PendingTaskVO;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.insight.client.AiSidecarClient;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Workspace-only endpoint that returns pending tasks pre-joined with the originator's
 * leave details and a rule-based risk grade. Lives in xg-business because it depends on
 * leave/checkin/violation mappers, which xg-platform does not (and must not) import.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/workflows/tasks")
@RequiredArgsConstructor
public class EnrichedTaskController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int SIMILAR_HISTORY_WINDOW_DAYS = 90;

    private final TaskInstanceMapper taskMapper;
    private final PendingTaskEnricher enricher;
    private final AiSidecarClient aiSidecarClient;
    private final LeaveRequestMapper leaveRequestMapper;

    @GetMapping("/pending-enriched")
    public R<PageResult<PendingTaskVO>> pendingEnriched(@Valid PageQuery query,
                                                         @RequestParam Long assigneeId) {
        Page<TaskInstance> page = query.toPage();
        taskMapper.selectPage(page,
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getAssigneeId, assigneeId)
                        .eq(TaskInstance::getStatus, "pending")
                        .orderByAsc(TaskInstance::getDueAt));
        Page<PendingTaskVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        voPage.setRecords(enricher.enrich(page.getRecords()));
        return R.ok(PageResult.of(voPage));
    }

    /**
     * On-demand natural-language recommendation for a single pending task. The rule engine
     * already gives the caller a deterministic risk level; this endpoint adds a short LLM
     * narrative plus per-case checkpoints. Returns an empty recommendation + error_message
     * on any LLM failure so the UI can degrade silently.
     */
    @GetMapping("/{taskId}/ai-recommendation")
    public R<Map<String, Object>> aiRecommendation(@PathVariable Long taskId) {
        TaskInstance task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BizException("NOT_FOUND", "任务不存在");
        }
        List<PendingTaskVO> enriched = enricher.enrich(List.of(task));
        if (enriched.isEmpty()) {
            throw new BizException("NOT_FOUND", "任务上下文不完整");
        }
        PendingTaskVO vo = enriched.get(0);
        // Pull the actual LeaveRequest so we can enrich the AI ctx with form_data
        // and similar-history pattern signals — both are missing from the pre-
        // enriched VO and they're high-value for the "AI != rule engine" case.
        LeaveRequest leave = null;
        if ("leave".equals(vo.getBizType()) && vo.getBizId() != null) {
            leave = leaveRequestMapper.selectById(vo.getBizId());
        }
        Map<String, Object> ctx = buildContext(vo, leave);
        Map<String, Object> raw = aiSidecarClient.taskRecommendation(ctx);
        return R.ok(raw);
    }

    private Map<String, Object> buildContext(PendingTaskVO vo, LeaveRequest leave) {
        Map<String, Object> m = new HashMap<>();
        m.put("biz_type", vo.getBizType() == null ? "" : vo.getBizType());
        m.put("risk_level", vo.getRiskLevel() == null ? "low" : vo.getRiskLevel());
        m.put("reasons", vo.getReasons() == null ? List.of() : vo.getReasons());
        m.put("initiator_name", vo.getInitiatorName() == null ? "" : vo.getInitiatorName());
        if (vo.getLeaveTypeName() != null) m.put("leave_type_name", vo.getLeaveTypeName());
        if (vo.getLeaveDurationDays() != null) m.put("leave_duration_days", vo.getLeaveDurationDays());
        if (vo.getLeaveReason() != null) m.put("leave_reason", vo.getLeaveReason());

        // Time window — lets the AI flag exam-week / holiday-edge submissions.
        if (vo.getLeaveStartTime() != null) {
            m.put("leave_start_time", vo.getLeaveStartTime().format(DateTimeFormatter.ISO_LOCAL_DATE));
        }
        if (vo.getLeaveEndTime() != null) {
            m.put("leave_end_time", vo.getLeaveEndTime().format(DateTimeFormatter.ISO_LOCAL_DATE));
        }

        // Form data — destination / emergency contact / etc. are user-supplied
        // fields the rule engine can't reason about. Forward as a flat map so
        // the prompt can selectively quote them.
        if (leave != null && leave.getFormData() != null && !leave.getFormData().isBlank()) {
            try {
                Map<String, Object> form = JSON.readValue(leave.getFormData(), new TypeReference<>() {});
                m.put("leave_form_data", form);
            } catch (Exception e) {
                log.debug("failed to parse leave form_data leave_id={}: {}", leave.getId(), e.getMessage());
            }
        }

        // Same-leave-type history (90 days). Pattern signal: "this student has
        // already taken 5 sick leaves this quarter" is invisible to risk_level
        // but obvious in raw counts.
        if (leave != null && leave.getStudentId() != null && leave.getLeaveTypeCode() != null) {
            Map<String, Object> sim = leaveRequestMapper.countSimilarByStudent(
                    leave.getStudentId(),
                    leave.getLeaveTypeCode(),
                    SIMILAR_HISTORY_WINDOW_DAYS,
                    leave.getId());
            if (sim != null) {
                m.put("similar_leave_count_90d", toInt(sim.get("cnt")));
                m.put("similar_leave_total_days_90d", sim.get("total_days"));
            }
        }

        ApplicantStats s = vo.getApplicantStats() == null ? new ApplicantStats() : vo.getApplicantStats();
        m.put("absent_30d", s.getAbsent30d());
        m.put("leave_count_30d", s.getLeaveCount30d());
        m.put("open_alerts_critical", s.getOpenAlertsCritical());
        m.put("open_alerts_high", s.getOpenAlertsHigh());
        m.put("open_alerts_medium", s.getOpenAlertsMedium());
        m.put("open_alerts_low", s.getOpenAlertsLow());
        m.put("unpunished_violations", s.getUnpunishedViolations());
        m.put("violation_90d", s.getViolation90d());
        return m;
    }

    private static int toInt(Object v) {
        if (v == null) return 0;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { return 0; }
    }
}
