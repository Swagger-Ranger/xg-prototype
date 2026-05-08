package com.xg.business.leave.controller;

import com.xg.business.leave.dto.ApplyYamlRequest;
import com.xg.business.leave.service.LeaveConfigSummaryService;
import com.xg.business.leave.service.LeaveConfigSummaryService.ConfigSummary;
import com.xg.business.leave.service.WorkflowConfigEditService;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.model.WorkflowDefinition;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * 「请销假配置」/ 通用 workflow_definition 配置 API。
 *
 * <p>Endpoint 列表:
 * <ul>
 *   <li>GET /summary — 中文 markdown 摘要(老师看)</li>
 *   <li>GET /yaml — 原始 YAML 文本(供 AI 助手做基线读)</li>
 *   <li>POST /apply — 发布新 YAML 为下一版 published(AI 助手确认后调)</li>
 * </ul>
 *
 * <p>所有写操作通过 AI 助手 + sidecar wizard tool 走;本 controller 不暴露
 * YAML 编辑器(高级编辑走 /workflows)。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workflow-config")
public class WorkflowConfigController {

    private final LeaveConfigSummaryService summaryService;
    private final WorkflowConfigEditService editService;

    /**
     * GET /api/v1/workflow-config/summary?biz_type=leave[&college_id=1013]
     */
    @GetMapping("/summary")
    public R<ConfigSummary> summary(
            @RequestParam("biz_type") String bizType,
            @RequestParam(value = "college_id", required = false) Long collegeId) {
        return R.ok(summaryService.summarize(bizType, collegeId));
    }

    /**
     * GET /api/v1/workflow-config/yaml?biz_type=leave[&college_id=]
     * 返回原始 YAML + 当前 version。前端不展示给老师,只供 AI 助手做基线读。
     */
    @GetMapping("/yaml")
    public R<Map<String, Object>> yaml(
            @RequestParam("biz_type") String bizType,
            @RequestParam(value = "college_id", required = false) Long collegeId) {
        WorkflowDefinition def = editService.findPublishedDefinition(bizType, collegeId);
        Map<String, Object> out = new HashMap<>();
        out.put("biz_type", bizType);
        out.put("college_id", collegeId);
        if (def == null) {
            out.put("version", null);
            out.put("yaml", null);
            return R.ok(out);
        }
        out.put("version", def.getVersion());
        out.put("yaml", def.getConfigYaml());
        return R.ok(out);
    }

    /**
     * POST /api/v1/workflow-config/apply
     * Body: {biz_type, college_id?, new_yaml, change_summary}
     *
     * 验证 + 发布新 YAML 作为下一版 published。
     */
    @PostMapping("/apply")
    public R<Map<String, Object>> apply(@RequestBody @Valid ApplyYamlRequest req) {
        if (req.getNewYaml() == null || req.getNewYaml().isBlank()) {
            throw new BizException("YAML_EMPTY", "新 YAML 为空");
        }
        WorkflowDefinition next = editService.applyYaml(
                req.getBizType(),
                req.getCollegeId(),
                req.getNewYaml(),
                req.getChangeSummary());
        Map<String, Object> out = new HashMap<>();
        out.put("biz_type", next.getBizType());
        out.put("college_id", next.getCollegeId());
        out.put("version", next.getVersion());
        out.put("name", next.getName());
        return R.ok(out);
    }
}
