package com.xg.platform.workflow.engine;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 只读 dry-run:扫 {@code workflow_definition.config_json} 和运行中实例的
 * {@code definition_snapshot},列出每个审批节点 assignee(role/scope)中
 * 当前没有任何 {@link AssigneeStrategy} 能解析、或虚拟角色 bizType 不匹配的组合。
 *
 * <p>Sprint 2 接 AssigneeCatalog hard fail 之前的存量摸底(RBAC 落地方案 §5.9.4 step2)。
 * 方案原文只扫定义,这里额外扫运行中实例的 snapshot —— 实例锁的是快照而非当前定义,
 * 定义级扫描漏掉的旧组合会在 Sprint 2 fail-fast 后才爆,必须提前发现。
 *
 * <p>复用真实 {@code AssigneeStrategy.supports()} 而非另抄一份"已知集合",
 * 避免与引擎解析逻辑漂移。全程只读,不写任何数据。
 */
@Service
@RequiredArgsConstructor
public class WorkflowAssigneeDryRunService {

    /** 虚拟角色与所需 bizType 的约束,镜像 WorkStudyAssigneeStrategy(S1-3)的硬校验。 */
    private static final Map<String, String> VIRTUAL_ROLE_BIZTYPE = Map.of(
            "employer_leader", "workstudy_position",
            "position_owner", "workstudy_application");

    private final List<AssigneeStrategy> strategies;
    private final WorkflowDefinitionMapper definitionMapper;
    private final WorkflowInstanceMapper instanceMapper;

    /**
     * @param source     definition / running_instance
     * @param reason      NO_STRATEGY(无策略可解析)/ BIZTYPE_MISMATCH(虚拟角色用错 bizType)
     */
    public record UnknownAssigneeRef(
            String source,
            Long refId,
            String code,
            Integer version,
            String bizType,
            String nodeId,
            String role,
            String scope,
            String reason
    ) {}

    public List<UnknownAssigneeRef> scan() {
        List<UnknownAssigneeRef> out = new ArrayList<>();

        // null wrapper = 全表(workflow_definition 量小);用字符串列 QueryWrapper
        // 避免 LambdaQueryWrapper 在无 MP 上下文单测里命中 lambda cache 坑。
        for (WorkflowDefinition def : definitionMapper.selectList(null)) {
            scanNodes(def.getConfigJson(), def.getBizType(),
                    "definition", def.getId(), def.getCode(), def.getVersion(), out);
        }

        List<WorkflowInstance> running = instanceMapper.selectList(
                new QueryWrapper<WorkflowInstance>().eq("status", "running"));
        for (WorkflowInstance inst : running) {
            scanNodes(inst.getDefinitionSnapshot(), inst.getBizType(),
                    "running_instance", inst.getId(), null, null, out);
        }
        return out;
    }

    private void scanNodes(Map<String, Object> config, String bizType,
                           String source, Long refId, String code, Integer version,
                           List<UnknownAssigneeRef> out) {
        if (config == null) return;
        Object nodesObj = config.get("nodes");
        if (!(nodesObj instanceof List<?> nodes)) return;
        for (Object n : nodes) {
            if (!(n instanceof Map<?, ?> node)) continue;
            // publicity 节点系统驱动,没有 assignee.role —— 与 WorkflowController 校验口径一致。
            Object type = node.get("type");
            if (type != null && "publicity".equalsIgnoreCase(type.toString())) continue;
            Object assignee = node.get("assignee");
            if (!(assignee instanceof Map<?, ?> a)) continue;
            Object roleObj = a.get("role");
            if (roleObj == null) continue;
            String role = roleObj.toString().trim();
            if (role.isEmpty()) continue;
            Object scopeObj = a.get("scope");
            String scope = scopeObj == null ? null : scopeObj.toString().trim();
            Object idObj = node.get("id");
            String nodeId = idObj == null ? null : idObj.toString();

            String reason = classify(role, scope, bizType);
            if (reason != null) {
                out.add(new UnknownAssigneeRef(source, refId, code, version,
                        bizType, nodeId, role, scope, reason));
            }
        }
    }

    /** null = 已知可解析;否则返回不可解析原因。 */
    private String classify(String role, String scope, String bizType) {
        boolean supported = false;
        for (AssigneeStrategy s : strategies) {
            if (s.supports(role, scope)) {
                supported = true;
                break;
            }
        }
        if (!supported) return "NO_STRATEGY";
        String requiredBiz = VIRTUAL_ROLE_BIZTYPE.get(role);
        if (requiredBiz != null && !requiredBiz.equals(bizType)) return "BIZTYPE_MISMATCH";
        return null;
    }
}
