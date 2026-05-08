package com.xg.platform.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.workflow.expression.ExpressionEvaluator;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.TaskInstance;
import com.xg.platform.workflow.model.WorkflowInstance;
import com.xg.platform.workflow.vo.InstanceTimelineVO;
import com.xg.platform.workflow.vo.OutcomePreviewVO;
import com.xg.platform.workflow.vo.TimelineActorVO;
import com.xg.platform.workflow.vo.TimelineNodeVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Builds the approval-time timeline view of a workflow instance.
 * Reads the instance's frozen {@code definition_snapshot}, collapses
 * {@code condition} nodes into {@code skip_label} hints on downstream nodes,
 * and decorates each remaining node with the actor + decision recorded
 * in {@code task_instance}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InstanceTimelineService {

    private static final String SCHOOL_ADMIN = "school_admin";
    private static final String STUDENT_ROLE = "student";

    private static final Map<String, String> ROLE_MASK_LABEL = Map.of(
            "counselor", "辅导员",
            "class_monitor", "班长",
            "dean", "院领导",
            "college_admin", "学院管理员",
            "student_affairs_officer", "学工部",
            "school_admin", "校级管理员",
            "super_admin", "平台管理员"
    );

    private final WorkflowInstanceMapper instanceMapper;
    private final TaskInstanceMapper taskMapper;
    private final SysUserMapper sysUserMapper;
    private final AssigneeLookupMapper roleLookup;
    private final ExpressionEvaluator evaluator;

    public InstanceTimelineVO buildTimeline(Long instanceId, Long viewerId) {
        WorkflowInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null) {
            throw new BizException("WORKFLOW_NOT_FOUND", "工作流实例不存在: " + instanceId);
        }

        List<TaskInstance> tasks = taskMapper.selectList(
                new LambdaQueryWrapper<TaskInstance>()
                        .eq(TaskInstance::getWorkflowInstanceId, instanceId)
                        .orderByAsc(TaskInstance::getAssignedAt)
        );

        List<String> viewerRoles = viewerId == null ? List.of()
                : roleLookup.findRoleCodesByUserId(viewerId);
        authorize(instance, tasks, viewerId, viewerRoles);

        Map<String, Object> snapshot = instance.getDefinitionSnapshot();
        if (snapshot == null) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION", "实例定义快照缺失");
        }

        List<Map<String, Object>> allNodes = nodes(snapshot);
        Map<String, Map<String, Object>> nodesById = indexById(allNodes);
        String startId = firstNodeId(snapshot, allNodes);

        // BFS over the actual path this instance will walk: condition nodes are
        // resolved against instance.context so we only expand the branch that
        // would be taken (e.g. type_router picks one leave_type, not all).
        Set<String> reachable = collectReachable(startId, nodesById, instance.getContext());
        // If the instance terminated on a rejected end node we follow rejected_next
        // for the most recent rejection so the terminal node still appears.
        if ("rejected".equals(instance.getStatus()) && instance.getCurrentNodeId() != null) {
            reachable.add(instance.getCurrentNodeId());
        }

        Map<String, String> skipLabels = computeSkipLabels(allNodes, reachable);

        // Build per-node VOs in snapshot declaration order, dropping condition nodes.
        List<TimelineNodeVO> outNodes = new ArrayList<>();
        boolean studentViewer = viewerRoles.contains(STUDENT_ROLE);
        Long initiatorId = instance.getInitiatorId();

        for (Map<String, Object> node : allNodes) {
            String id = (String) node.get("id");
            if (!reachable.contains(id)) continue;
            String type = lower((String) node.get("type"));
            if ("condition".equals(type)) continue;

            TimelineNodeVO vo = new TimelineNodeVO();
            vo.setId(id);
            vo.setName((String) node.getOrDefault("name", id));
            vo.setType(type);
            vo.setSkipLabel(skipLabels.get(id));
            decorateState(vo, node, instance, tasks, initiatorId);
            maskActorIfNeeded(vo, studentViewer, viewerId, initiatorId);
            vo.setCurrentForViewer(viewerId != null
                    && "in_progress".equals(vo.getState())
                    && viewerId.equals(actorIdOf(vo)));
            outNodes.add(vo);
        }

        InstanceTimelineVO out = new InstanceTimelineVO();
        out.setInstanceId(instance.getId());
        out.setBizType(instance.getBizType());
        out.setStatus(instance.getStatus());
        out.setCurrentNodeId(instance.getCurrentNodeId());
        out.setNodes(outNodes);
        out.setOutcomePreview(buildOutcomePreview(instance, nodesById));
        return out;
    }

    /* ---------------- authorization ---------------- */

    private void authorize(WorkflowInstance instance, List<TaskInstance> tasks,
                           Long viewerId, List<String> viewerRoles) {
        if (viewerId == null) {
            throw new BizException("UNAUTHENTICATED", "缺少用户身份");
        }
        if (viewerId.equals(instance.getInitiatorId())) return;
        if (viewerRoles.contains(SCHOOL_ADMIN)) return;
        boolean isAssignee = tasks.stream()
                .anyMatch(t -> viewerId.equals(t.getAssigneeId()));
        if (!isAssignee) {
            throw new BizException("FORBIDDEN", "无权查看该流程");
        }
    }

    /* ---------------- snapshot helpers ---------------- */

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> nodes(Map<String, Object> snapshot) {
        Object n = snapshot.get("nodes");
        if (!(n instanceof List)) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION", "工作流定义缺少 nodes");
        }
        return (List<Map<String, Object>>) n;
    }

    private Map<String, Map<String, Object>> indexById(List<Map<String, Object>> nodes) {
        Map<String, Map<String, Object>> map = new HashMap<>();
        for (Map<String, Object> n : nodes) {
            map.put((String) n.get("id"), n);
        }
        return map;
    }

    private String firstNodeId(Map<String, Object> snapshot, List<Map<String, Object>> nodes) {
        String start = (String) snapshot.get("start");
        if (start != null) return start;
        if (nodes.isEmpty()) {
            throw new BizException("WORKFLOW_INVALID_DEFINITION", "工作流定义没有节点");
        }
        return (String) nodes.get(0).get("id");
    }

    /**
     * BFS forward edges only (next, condition.branches.next). rejected_next is
     * deliberately excluded so the timeline shows the path this instance will
     * actually walk, not every alternate end. For condition nodes we evaluate
     * each branch's predicate against {@code context} and follow only the one
     * that matches — otherwise a {@code type_router} (assignee dispatch by
     * leave_type) would expose every other type's approval chain on every
     * instance's timeline. Callers add the final node if the instance
     * actually terminated on a rejected branch.
     */
    @SuppressWarnings("unchecked")
    private Set<String> collectReachable(String startId,
                                          Map<String, Map<String, Object>> byId,
                                          Map<String, Object> context) {
        Set<String> seen = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        queue.add(startId);
        Map<String, Object> ctx = context == null ? Map.of() : context;
        while (!queue.isEmpty()) {
            String id = queue.poll();
            if (id == null || !seen.add(id)) continue;
            Map<String, Object> node = byId.get(id);
            if (node == null) continue;
            String type = lower((String) node.get("type"));
            if ("condition".equals(type)) {
                String picked = pickConditionBranch(node, ctx);
                if (picked != null) queue.add(picked);
            } else if (!"end".equals(type)) {
                Object nx = node.get("next");
                if (nx instanceof String s) queue.add(s);
            }
        }
        return seen;
    }

    /**
     * Pick the single branch a condition node would take given the instance
     * context: first non-default branch whose predicate evaluates true, else
     * the {@code default} branch. Returns null when no branch is followable.
     */
    @SuppressWarnings("unchecked")
    private String pickConditionBranch(Map<String, Object> node, Map<String, Object> ctx) {
        Object branches = node.get("branches");
        if (!(branches instanceof List<?> list) || list.isEmpty()) return null;
        String defaultTarget = null;
        for (Object b : list) {
            if (!(b instanceof Map<?, ?> bm)) continue;
            if (isDefaultBranch(bm)) {
                Object nx = bm.get("next");
                if (nx instanceof String s) defaultTarget = s;
                continue;
            }
            Object whenObj = bm.get("when");
            if (whenObj == null) continue;
            try {
                if (evaluator.evaluate(String.valueOf(whenObj), ctx)) {
                    Object nx = bm.get("next");
                    if (nx instanceof String s) return s;
                }
            } catch (Exception e) {
                log.debug("collectReachable: branch eval failed for '{}': {}",
                        whenObj, e.getMessage());
            }
        }
        return defaultTarget;
    }

    /**
     * For each condition branch in {@code reachable}, attach a human-readable
     * label to the downstream node — but only if every entry path into that
     * downstream is conditional. A node reached unconditionally (via a regular
     * {@code next} or a {@code default} branch) gets no label, since the user
     * will land there regardless of any predicate.
     */
    @SuppressWarnings("unchecked")
    private Map<String, String> computeSkipLabels(List<Map<String, Object>> allNodes,
                                                   Set<String> reachable) {
        Map<String, String> conditional = new LinkedHashMap<>();
        Set<String> unconditional = new HashSet<>();

        for (Map<String, Object> node : allNodes) {
            String id = (String) node.get("id");
            if (!reachable.contains(id)) continue;
            String type = lower((String) node.get("type"));
            if ("condition".equals(type)) {
                Object branches = node.get("branches");
                if (branches instanceof List<?> list) {
                    for (Object b : list) {
                        if (!(b instanceof Map<?, ?> bm)) continue;
                        Object nx = bm.get("next");
                        if (!(nx instanceof String target)) continue;
                        if (!reachable.contains(target)) continue;
                        if (isDefaultBranch(bm)) {
                            unconditional.add(target);
                        } else {
                            conditional.putIfAbsent(target, branchLabel(bm));
                        }
                    }
                }
            } else if (!"end".equals(type)) {
                Object nx = node.get("next");
                if (nx instanceof String s) unconditional.add(s);
            }
        }
        // Drop labels for nodes that also have an unconditional entry —
        // the predicate would mislead since the user lands there regardless.
        conditional.keySet().removeAll(unconditional);
        return conditional;
    }

    private boolean isDefaultBranch(Map<?, ?> branch) {
        Object when = branch.get("when");
        if (when == null) return true;
        String s = String.valueOf(when).trim();
        return s.isEmpty() || "default".equalsIgnoreCase(s) || "true".equalsIgnoreCase(s);
    }

    /**
     * Prefer admin-authored {@code display_label}; fall back to a humanized
     * Chinese rendering of the predicate via {@link #humanizeExpression}.
     * The fallback intentionally **never** leaks the raw expression — when
     * the predicate doesn't match any known pattern we return a generic
     * "满足条件时进入此节点" instead, so end users never see syntax like
     * {@code duration_days >= 3} on the timeline.
     */
    private String branchLabel(Map<?, ?> branch) {
        Object label = branch.get("display_label");
        if (label != null && !String.valueOf(label).isBlank()) {
            return String.valueOf(label);
        }
        Object when = branch.get("when");
        if (when == null) return null;
        return humanizeExpression(String.valueOf(when));
    }

    /** {@link #FIELD_LABELS_ZH} drives {@link #humanizeExpression}. Add a
     *  variable here when a new workflow exposes a new condition field. */
    private static final Map<String, String> FIELD_LABELS_ZH = Map.of(
            "duration_days", "请假天数",
            "hours", "时长",
            "headcount", "招聘人数",
            "amount", "金额"
    );

    /** Common DSL expression shape: {@code <field> <op> <number>}. We only
     *  match this minimal shape — anything fancier (logical &&, function
     *  calls, etc.) falls through to the generic "满足条件时进入此节点". */
    private static final java.util.regex.Pattern SIMPLE_PREDICATE =
            java.util.regex.Pattern.compile("^\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*(>=|<=|==|!=|>|<)\\s*(-?\\d+(?:\\.\\d+)?)\\s*$");

    /** Map operator to Chinese phrasing. Pairs with field unit hints for
     *  natural sentences ("请假天数 ≥ 3 天"). */
    private static final Map<String, String> OP_LABELS_ZH = Map.of(
            ">=", "≥",
            "<=", "≤",
            "==", "等于",
            "!=", "不等于",
            ">",  "大于",
            "<",  "小于"
    );

    /** Per-field unit suffix appended after the number ("3 天" vs bare "3"). */
    private static final Map<String, String> FIELD_UNITS_ZH = Map.of(
            "duration_days", "天",
            "hours", "小时",
            "headcount", "人",
            "amount", "元"
    );

    /**
     * Translate a workflow DSL predicate into a user-readable Chinese phrase.
     * Returns the generic fallback when the predicate doesn't match the
     * supported shape — never echoes raw syntax to end users.
     */
    private String humanizeExpression(String when) {
        String s = when == null ? "" : when.trim();
        if (s.isEmpty() || "default".equalsIgnoreCase(s) || "true".equalsIgnoreCase(s)) {
            return "其他情况下进入此节点";
        }
        java.util.regex.Matcher m = SIMPLE_PREDICATE.matcher(s);
        if (m.matches()) {
            String field = m.group(1);
            String op = m.group(2);
            String num = m.group(3);
            String fieldZh = FIELD_LABELS_ZH.get(field);
            String opZh = OP_LABELS_ZH.get(op);
            String unit = FIELD_UNITS_ZH.getOrDefault(field, "");
            if (fieldZh != null && opZh != null) {
                return fieldZh + " " + opZh + " " + num + unit + " 时进入此节点";
            }
        }
        // Unknown shape — never leak raw expression to users.
        return "满足条件时进入此节点";
    }

    /* ---------------- per-node state ---------------- */

    private void decorateState(TimelineNodeVO vo, Map<String, Object> node,
                               WorkflowInstance instance, List<TaskInstance> tasks,
                               Long initiatorId) {
        String nodeId = vo.getId();
        String type = vo.getType();
        String currentNodeId = instance.getCurrentNodeId();
        String instanceStatus = instance.getStatus();

        // 1. Approval node — read directly from task_instance.
        if ("approval".equals(type)) {
            Optional<TaskInstance> completed = tasks.stream()
                    .filter(t -> nodeId.equals(t.getNodeId()))
                    .filter(t -> "approved".equals(t.getStatus()) || "rejected".equals(t.getStatus()))
                    .findFirst();
            if (completed.isPresent()) {
                TaskInstance t = completed.get();
                vo.setState("completed");
                vo.setDecision(t.getStatus());
                vo.setComment(t.getComment());
                vo.setCompletedAt(t.getCompletedAt());
                vo.setDurationMs(t.getDecisionDurationMs());
                vo.setActor(actorOf(t.getAssigneeId(), null));
                return;
            }
            Optional<TaskInstance> pending = tasks.stream()
                    .filter(t -> nodeId.equals(t.getNodeId()))
                    .filter(t -> "pending".equals(t.getStatus()))
                    .findFirst();
            if (pending.isPresent()) {
                TaskInstance t = pending.get();
                vo.setState("in_progress");
                vo.setDueAt(t.getDueAt());
                vo.setActor(actorOf(t.getAssigneeId(), null));
                return;
            }
            vo.setState("pending");
            return;
        }

        // 2. form_submit — implicitly completed when the instance has moved past it.
        if ("form_submit".equals(type)) {
            if (currentNodeId != null && nodeId.equals(currentNodeId)
                    && "running".equals(instanceStatus)) {
                vo.setState("in_progress");
            } else {
                vo.setState("completed");
                vo.setCompletedAt(instance.getStartedAt());
            }
            vo.setActor(actorOf(initiatorId, "student"));
            return;
        }

        // 3. end — completed when the instance has terminated on this node.
        if ("end".equals(type)) {
            boolean terminal = !"running".equals(instanceStatus)
                    && nodeId.equals(currentNodeId);
            if (terminal) {
                vo.setState("completed");
                vo.setCompletedAt(instance.getFinishedAt());
            } else {
                vo.setState("pending");
            }
            return;
        }

        // 4. notification / unknown — approximate from currentNodeId.
        if (nodeId.equals(currentNodeId)) {
            vo.setState("in_progress");
        } else {
            vo.setState("pending");
        }
    }

    private Long actorIdOf(TimelineNodeVO vo) {
        return vo.getActor() == null ? null : vo.getActor().getId();
    }

    private TimelineActorVO actorOf(Long userId, String fallbackRole) {
        if (userId == null) return null;
        SysUser user = sysUserMapper.selectById(userId);
        TimelineActorVO actor = new TimelineActorVO();
        actor.setId(userId);
        actor.setName(user != null ? user.getRealName() : null);
        // Best-effort role hint: caller-supplied takes precedence (e.g. initiator → "student"),
        // otherwise resolve from sys_user_role and pick the highest-rank match.
        if (fallbackRole != null) {
            actor.setRole(fallbackRole);
        } else {
            actor.setRole(primaryRoleOf(userId));
        }
        return actor;
    }

    private String primaryRoleOf(Long userId) {
        List<String> codes = roleLookup.findRoleCodesByUserId(userId);
        if (codes == null || codes.isEmpty()) return null;
        // Order matters only when a user holds multiple roles (rare). Prefer
        // the role most relevant to "who is acting on a workflow task".
        for (String preferred : List.of("counselor", "dean", "college_admin",
                "student_affairs_officer", "school_admin", "super_admin")) {
            if (codes.contains(preferred)) return preferred;
        }
        return codes.get(0);
    }

    private void maskActorIfNeeded(TimelineNodeVO vo, boolean studentViewer,
                                    Long viewerId, Long initiatorId) {
        if (!studentViewer) return;
        TimelineActorVO actor = vo.getActor();
        if (actor == null) return;
        // Initiator-self is fine — they already know their own name.
        if (viewerId != null && viewerId.equals(actor.getId())) return;
        // Other students (rare, e.g. proxy initiators) should also be masked
        // by role label so a student viewer never sees other students' names.
        String mask = ROLE_MASK_LABEL.getOrDefault(actor.getRole(),
                STUDENT_ROLE.equals(actor.getRole()) ? "学生" : actor.getName());
        actor.setName(mask);
    }

    /* ---------------- outcome preview ---------------- */

    @SuppressWarnings("unchecked")
    private OutcomePreviewVO buildOutcomePreview(WorkflowInstance instance,
                                                  Map<String, Map<String, Object>> byId) {
        if (!"running".equals(instance.getStatus())) return null;
        String currentId = instance.getCurrentNodeId();
        if (currentId == null) return null;
        Map<String, Object> current = byId.get(currentId);
        if (current == null) return null;
        if (!"approval".equalsIgnoreCase((String) current.get("type"))) return null;

        String approveTarget = followToTerminalOrApproval(
                (String) current.get("next"), byId, instance.getContext());
        String rejectTarget = (String) current.get("rejected_next");
        if (rejectTarget == null) {
            // Fall back to the first end node — same convention as the engine.
            rejectTarget = byId.values().stream()
                    .filter(n -> "end".equalsIgnoreCase((String) n.get("type")))
                    .map(n -> (String) n.get("id"))
                    .findFirst().orElse(null);
        }

        OutcomePreviewVO out = new OutcomePreviewVO();
        out.setOnApprove(formatOutcome(byId.get(approveTarget), "通过后进入 ", "通过后流程结束"));
        out.setOnReject(formatOutcome(byId.get(rejectTarget), "驳回后进入 ", "驳回后流程结束"));
        return out;
    }

    /**
     * Walk forward through condition nodes until we hit an approval / end,
     * evaluating each branch's {@code when} against the instance's live
     * {@code context} so the preview matches the path the engine will actually
     * take. Falls back to the default branch if no predicate matches and to
     * the first branch as a final fallback.
     */
    @SuppressWarnings("unchecked")
    private String followToTerminalOrApproval(String startId,
                                               Map<String, Map<String, Object>> byId,
                                               Map<String, Object> context) {
        String id = startId;
        Map<String, Object> ctx = context == null ? Map.of() : context;
        for (int i = 0; i < 16 && id != null; i++) {
            Map<String, Object> node = byId.get(id);
            if (node == null) return id;
            String type = lower((String) node.get("type"));
            if ("condition".equals(type)) {
                List<Map<String, Object>> branches = (List<Map<String, Object>>) node.get("branches");
                if (branches == null || branches.isEmpty()) return null;
                String picked = null;
                for (Map<String, Object> b : branches) {
                    if (isDefaultBranch(b)) continue;
                    String when = (String) b.get("when");
                    try {
                        if (evaluator.evaluate(when, ctx)) {
                            picked = (String) b.get("next");
                            break;
                        }
                    } catch (Exception e) {
                        log.debug("preview branch evaluation failed for '{}': {}", when, e.getMessage());
                    }
                }
                if (picked == null) {
                    for (Map<String, Object> b : branches) {
                        if (isDefaultBranch(b)) {
                            picked = (String) b.get("next");
                            break;
                        }
                    }
                }
                if (picked == null) picked = (String) branches.get(0).get("next");
                id = picked;
                continue;
            }
            return id;
        }
        return id;
    }

    private String formatOutcome(Map<String, Object> node, String prefix, String terminalMsg) {
        if (node == null) return terminalMsg;
        String type = lower((String) node.get("type"));
        if ("end".equals(type)) {
            String name = (String) node.getOrDefault("name", null);
            return name != null ? "流程结束（" + name + "）" : terminalMsg;
        }
        return prefix + node.getOrDefault("name", node.get("id"));
    }

    private static String lower(String s) {
        return s == null ? null : s.toLowerCase();
    }
}
