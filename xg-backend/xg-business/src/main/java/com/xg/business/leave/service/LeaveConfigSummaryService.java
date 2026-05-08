package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.leave.mapper.LeaveTypeConfigMapper;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.model.WorkflowDefinition;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把 workflow_definition.config_yaml 翻译成中文 markdown，供「请销假配置」
 * 页面展示。算法：
 *
 * <ol>
 *   <li>找 type_router 节点（按 leave_type_code 分流）；不存在则视为单链 YAML（销假场景）。</li>
 *   <li>对每个分支起点，沿 next 走链：approval 节点累加角色，condition 节点 (duration_days &lt;= N)
 *       视为分档界点。</li>
 *   <li>渲染为「假别 / 0-N 天: 角色 → 角色 → ... 」结构。</li>
 * </ol>
 *
 * <p>设计：纯数据转换，无 LLM 介入。AI 改配置走另一条路径（sidecar wizard tool）。
 * 这里就是把 YAML "翻译"成老师能看懂的中文，所有改动都通过 AI 助手或 /workflows
 * 编辑 YAML 后更新。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveConfigSummaryService {

    private static final Map<String, String> ROLE_LABELS = Map.ofEntries(
            Map.entry("class_master", "班主任"),
            Map.entry("counselor", "辅导员"),
            Map.entry("college_secretary", "院系书记"),
            Map.entry("college_admin", "院系管理员"),
            Map.entry("dean", "院系领导"),
            Map.entry("student_affairs_officer", "学工处人员"),
            Map.entry("student_affairs_director", "学工部部长"),
            Map.entry("school_admin", "校级管理员")
    );

    private final WorkflowDefinitionMapper definitionMapper;
    private final LeaveTypeConfigMapper leaveTypeMapper;

    /** 动态从 leave_type_config 表拉 code → 中文 name 映射(支持新增假别)。 */
    private Map<String, String> loadLeaveTypeLabels() {
        Map<String, String> out = new HashMap<>();
        for (LeaveTypeConfig t : leaveTypeMapper.listAll()) {
            if (t.getCode() != null && t.getName() != null) {
                out.put(t.getCode(), t.getName());
            }
        }
        return out;
    }

    /**
     * 当前 published YAML 的中文 markdown 摘要。collegeId 非空时优先取学院 override
     * 的 YAML，缺失回落到全校默认 (college_id IS NULL)。
     */
    public ConfigSummary summarize(String bizType, Long collegeId) {
        WorkflowDefinition def = resolvePublished(bizType, collegeId);
        if (def == null) {
            return new ConfigSummary(bizType, collegeId, null, null,
                    "（暂无已发布配置）");
        }
        Map<String, Object> parsed;
        try {
            parsed = new Yaml().load(def.getConfigYaml());
        } catch (Exception e) {
            log.warn("YAML parse failed for definition {}: {}", def.getId(), e.getMessage());
            return new ConfigSummary(bizType, collegeId, def.getVersion(), def.getName(),
                    "（YAML 解析失败：" + e.getMessage() + "）");
        }
        String md = renderMarkdown(parsed, bizType, loadLeaveTypeLabels());
        return new ConfigSummary(bizType, collegeId, def.getVersion(), def.getName(), md);
    }

    private WorkflowDefinition resolvePublished(String bizType, Long collegeId) {
        if (collegeId != null) {
            WorkflowDefinition specific = definitionMapper.selectOne(
                    new LambdaQueryWrapper<WorkflowDefinition>()
                            .eq(WorkflowDefinition::getBizType, bizType)
                            .eq(WorkflowDefinition::getCollegeId, collegeId)
                            .eq(WorkflowDefinition::getStatus, "published")
                            .orderByDesc(WorkflowDefinition::getVersion)
                            .last("LIMIT 1"));
            if (specific != null) return specific;
        }
        return definitionMapper.selectOne(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getBizType, bizType)
                        .isNull(WorkflowDefinition::getCollegeId)
                        .eq(WorkflowDefinition::getStatus, "published")
                        .orderByDesc(WorkflowDefinition::getVersion)
                        .last("LIMIT 1"));
    }

    @SuppressWarnings("unchecked")
    private String renderMarkdown(Map<String, Object> cfg, String bizType, Map<String, String> labels) {
        StringBuilder md = new StringBuilder();

        // 表单字段
        Object form = cfg.get("form");
        if (form instanceof Map<?, ?> fm) {
            Object fields = ((Map<String, Object>) fm).get("fields");
            if (fields instanceof List<?> fl && !fl.isEmpty()) {
                md.append("### 学生提交时需填字段\n\n");
                for (Object f : fl) {
                    if (!(f instanceof Map<?, ?> fmap)) continue;
                    Map<String, Object> field = (Map<String, Object>) fmap;
                    String label = String.valueOf(field.getOrDefault("label", field.get("name")));
                    boolean required = Boolean.TRUE.equals(field.get("required"));
                    md.append("- ").append(label);
                    if (required) md.append("（必填）");
                    md.append("\n");
                }
                md.append("\n");
            }
        }

        // 节点 → 假别审批链
        Object nodesObj = cfg.get("nodes");
        if (!(nodesObj instanceof List<?> nodesList)) {
            md.append("（YAML 缺少 nodes）");
            return md.toString();
        }
        Map<String, Map<String, Object>> nodes = new LinkedHashMap<>();
        for (Object n : nodesList) {
            if (n instanceof Map<?, ?> nm) {
                Map<String, Object> nmap = (Map<String, Object>) nm;
                Object id = nmap.get("id");
                if (id != null) nodes.put(id.toString(), nmap);
            }
        }

        // 找 type_router(请假场景),没有则当作单链(销假场景)
        Map<String, Object> router = nodes.get("type_router");
        if (router != null && "condition".equals(router.get("type"))) {
            md.append("### 假别 + 审批链\n\n");
            Object branches = router.get("branches");
            if (branches instanceof List<?> bl) {
                for (Object b : bl) {
                    if (!(b instanceof Map<?, ?> bm)) continue;
                    Map<String, Object> branch = (Map<String, Object>) bm;
                    String when = String.valueOf(branch.getOrDefault("when", ""));
                    if (!when.contains("leave_type_code")) continue;
                    String code = extractLeaveTypeCode(when);
                    String label = labels.getOrDefault(code, code);
                    md.append("**").append(label).append("**\n\n");
                    String chainSummary = traceChain(nodes, String.valueOf(branch.get("next")));
                    md.append(chainSummary).append("\n\n");
                }
            }
        } else {
            // 单链:从 start 节点开始 trace
            Map<String, Object> start = nodes.get(String.valueOf(cfg.get("start")));
            if (start != null) {
                md.append("### 审批流程\n\n");
                md.append(traceChain(nodes, String.valueOf(start.get("next")))).append("\n");
            }
        }

        return md.toString();
    }

    private static String extractLeaveTypeCode(String when) {
        // "leave_type_code == 'personal'" → "personal"
        int eq = when.indexOf("==");
        if (eq < 0) return "";
        String tail = when.substring(eq + 2).trim();
        if (tail.startsWith("'") || tail.startsWith("\"")) {
            tail = tail.substring(1);
            int end = tail.indexOf(tail.charAt(0) == '"' ? '"' : '\'');
            return end >= 0 ? tail.substring(0, end) : tail;
        }
        return tail;
    }

    /**
     * 沿链走 approval 累加角色,遇 condition (duration_days &lt;= N) 表示分档,
     * 渲染为 "0-N 天: 角色 → 角色"。链终态 approved/rejected 返回。
     */
    @SuppressWarnings("unchecked")
    private String traceChain(Map<String, Map<String, Object>> nodes, String startId) {
        List<String> accumulated = new ArrayList<>();
        List<int[]> segmentBounds = new ArrayList<>();   // [lower, upper] (-1 = ∞)
        List<List<String>> segmentRoles = new ArrayList<>();
        int prevThreshold = 0;
        String currentId = startId;
        int safety = 50;

        while (currentId != null && safety-- > 0) {
            Map<String, Object> node = nodes.get(currentId);
            if (node == null) break;
            String type = String.valueOf(node.get("type"));
            if ("approval".equals(type)) {
                Object assignee = node.get("assignee");
                if (assignee instanceof Map<?, ?> am) {
                    String role = String.valueOf(((Map<String, Object>) am).get("role"));
                    if (!accumulated.contains(role)) {
                        accumulated.add(role);
                    }
                }
                currentId = String.valueOf(node.get("next"));
            } else if ("condition".equals(type)) {
                // 找 duration_days <= N 的分支(approved 出口)和 default 分支(继续链)
                Object branches = node.get("branches");
                Integer threshold = null;
                String defaultNext = null;
                if (branches instanceof List<?> bl) {
                    for (Object b : bl) {
                        if (!(b instanceof Map<?, ?> bm)) continue;
                        Map<String, Object> branch = (Map<String, Object>) bm;
                        String when = String.valueOf(branch.getOrDefault("when", ""));
                        if ("default".equals(when) || "true".equals(when)) {
                            defaultNext = String.valueOf(branch.get("next"));
                        } else if (when.contains("duration_days") && when.contains("<=")) {
                            try {
                                String t = when.substring(when.indexOf("<=") + 2).trim();
                                threshold = Integer.parseInt(t);
                            } catch (NumberFormatException ignored) { /* skip */ }
                        }
                    }
                }
                if (threshold != null) {
                    segmentBounds.add(new int[]{prevThreshold, threshold});
                    segmentRoles.add(new ArrayList<>(accumulated));
                    prevThreshold = threshold;
                }
                currentId = defaultNext;
            } else if ("end".equals(type)) {
                // 走到 approved:剩余无上限段
                if ("completed".equals(node.get("status"))) {
                    if (!accumulated.isEmpty()) {
                        segmentBounds.add(new int[]{prevThreshold, -1});  // -1=∞
                        segmentRoles.add(new ArrayList<>(accumulated));
                    }
                }
                break;
            } else {
                // 不识别的节点,跳出
                break;
            }
        }

        if (segmentBounds.isEmpty()) {
            return "（无审批节点）";
        }

        StringBuilder out = new StringBuilder();
        for (int i = 0; i < segmentBounds.size(); i++) {
            int[] b = segmentBounds.get(i);
            String range;
            if (b[1] < 0) {
                range = b[0] + " 天以上";
            } else {
                range = b[0] + "-" + b[1] + " 天";
            }
            String roles = String.join(" → ", segmentRoles.get(i).stream()
                    .map(r -> ROLE_LABELS.getOrDefault(r, r))
                    .toList());
            out.append("- ").append(range).append("：").append(roles).append("\n");
        }
        return out.toString();
    }

    /** 概览返回 DTO(不暴露 YAML 文本)。 */
    public record ConfigSummary(
            String bizType,
            Long collegeId,
            Integer version,
            String name,
            String summaryMd
    ) {}
}
