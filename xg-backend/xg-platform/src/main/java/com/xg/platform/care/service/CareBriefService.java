package com.xg.platform.care.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.mapper.TaskAiBriefHistoryMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.model.TaskAiBriefHistory;
import com.xg.platform.insight.client.AiSidecarClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 生成并存档 AI brief。PRD §11。
 *
 * <p>分工（评审定）：输入安全靠 {@link CareBriefContextBuilder} 按构造保证；
 * 输出 sanitize（禁用词扫描 / schema 强约束）由 Python sidecar 做，回传
 * {@code sanitize_result}；本类只负责存档 + 按 §11.5 决定是否展示。
 *
 * <p>§11.5 降级：sidecar 不可用 / 超时 / 输出缺字段 → 不抛异常、不写 history、
 * current_brief_id 不变，任务照常可用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareBriefService {

    static final String AGENT = "care_brief";
    static final String PROMPT_VERSION = "care-brief-v1";

    /** brief jsonb 只存这 5 个 PRD §11.3 字段，其余（sanitize_result/llm_model）入独立列 */
    private static final List<String> BRIEF_FIELDS =
            List.of("why", "talking_points", "avoid_topics", "campus_resources", "follow_up_days");

    private final CareBriefContextBuilder contextBuilder;
    private final AiSidecarClient aiSidecarClient;
    private final TaskAiBriefHistoryMapper briefHistoryMapper;
    private final CareTaskMapper careTaskMapper;

    @Transactional
    public CareBriefResult generate(CareTask task, String trigger) {
        Map<String, Object> context = contextBuilder.build(task);
        String traceId = "care-brief-" + task.getId() + "-" + System.currentTimeMillis();

        AiSidecarClient.AgentResult r =
                aiSidecarClient.invokeAgent(AGENT, context, Map.of(), traceId);
        if (!r.ok()) {
            // §11.5：sidecar 故障 → 降级，不写 history（无 output 可存），任务照常
            log.warn("care brief sidecar failed taskId={} trigger={} err={}",
                    task.getId(), trigger, r.errorMessage());
            return CareBriefResult.FAILED;
        }

        Map<String, Object> output = r.output();
        Object why = output == null ? null : output.get("why");
        if (why == null || why.toString().isBlank()) {
            log.warn("care brief malformed (no why) taskId={} trigger={}", task.getId(), trigger);
            return CareBriefResult.FAILED;
        }

        String sanitize = str(output.get("sanitize_result"), "pass");
        String llmModel = str(output.get("llm_model"), "unknown");

        Map<String, Object> brief = new LinkedHashMap<>();
        for (String f : BRIEF_FIELDS) {
            brief.put(f, output.get(f));
        }

        OffsetDateTime now = OffsetDateTime.now();
        TaskAiBriefHistory hist = new TaskAiBriefHistory();
        hist.setTenantId(TenantContext.getTenantId());
        hist.setTaskId(task.getId());
        hist.setBrief(brief);
        hist.setGeneratedAt(now);
        hist.setGenerationTrigger(trigger);
        hist.setPromptVersion(PROMPT_VERSION);
        hist.setLlmModel(llmModel);
        hist.setSanitizeResult(sanitize);
        briefHistoryMapper.insert(hist);

        if ("blocked".equals(sanitize)) {
            // §11.5：sanitize 不通过 → 留痕但不展示，current_brief_id 不指向它
            log.info("care brief blocked by sanitize taskId={} trigger={}", task.getId(), trigger);
            return CareBriefResult.BLOCKED;
        }

        // pass / redacted：可展示，current_brief_id 指向最新
        task.setCurrentBriefId(hist.getId());
        task.setUpdatedAt(now);
        careTaskMapper.updateById(task);
        return CareBriefResult.GENERATED;
    }

    /**
     * 该任务最近一次 brief 是否在 minutes 分钟内生成 —— manual_refresh 5 分钟限流用。
     * 不区分 trigger：任何最近生成都算（刚 batch 过就别再手动刷）。
     */
    public boolean generatedWithinMinutes(Long taskId, int minutes) {
        List<TaskAiBriefHistory> rows = briefHistoryMapper.selectList(
                new LambdaQueryWrapper<TaskAiBriefHistory>()
                        .eq(TaskAiBriefHistory::getTaskId, taskId)
                        .orderByDesc(TaskAiBriefHistory::getGeneratedAt)
                        .last("limit 1"));
        if (rows.isEmpty()) return false;
        OffsetDateTime last = rows.get(0).getGeneratedAt();
        return last != null && last.isAfter(OffsetDateTime.now().minusMinutes(minutes));
    }

    private static String str(Object o, String dft) {
        return o == null || o.toString().isBlank() ? dft : o.toString();
    }
}
