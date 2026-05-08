package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.business.leave.mapper.LeaveTypeConfigMapper;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.model.WorkflowDefinition;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.Yaml;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 助手 / 高级模式应用新 YAML 的 service。
 *
 * <p>流程:
 * <ol>
 *   <li>读 (bizType, collegeId) 的当前 published(为下一版定 version + 拷字段)</li>
 *   <li>新 YAML 解析校验(必须有 nodes / start)</li>
 *   <li>事务内:旧 published → disabled,插新行 version+1 status=published</li>
 *   <li>partial unique index 兜底唯一性</li>
 * </ol>
 *
 * <p>不做 dryRun(交给 AI 助手在 propose 阶段已经做),也不做 FormSchemaDiff
 * RED 校验(P0 阶段简化,后续按需补)。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowConfigEditService {

    private final WorkflowDefinitionMapper definitionMapper;
    private final LeaveTypeConfigMapper leaveTypeMapper;

    /**
     * 读 published YAML 文本(供 AI 助手做基线)。collegeId 优先匹配,缺失回落 NULL。
     * 找不到 published 时返回 null。
     */
    public WorkflowDefinition findPublishedDefinition(String bizType, Long collegeId) {
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

    /**
     * 发布新 YAML 为下一版 published。collegeId 为 null 即更新/创建全校默认;
     * 非 null 即学院 override(目前 P0 单租户演示场景,先支持 null;非 null 走同样
     * 路径,只是 partial unique index 隔离桶不同)。
     */
    @Transactional
    @SuppressWarnings("unchecked")
    public WorkflowDefinition applyYaml(String bizType, Long collegeId, String newYaml, String changeSummary) {
        // 1. 解析 + 基本校验
        Map<String, Object> parsed;
        try {
            parsed = new Yaml().load(newYaml);
        } catch (Exception e) {
            throw new BizException("YAML_PARSE_ERROR", "YAML 解析失败:" + e.getMessage());
        }
        if (parsed == null || !(parsed.get("nodes") instanceof List<?> nl) || nl.isEmpty()) {
            throw new BizException("YAML_INVALID", "新 YAML 缺少 nodes 或为空");
        }
        if (parsed.get("start") == null) {
            throw new BizException("YAML_INVALID", "新 YAML 缺少 start 节点 id");
        }

        // 2. 找当前 published 拷 code/name/module
        WorkflowDefinition current = findPublishedDefinition(bizType, collegeId);

        // 零改动拦截:新 YAML 跟当前 published 在结构上等价就拒绝(避免 LLM 嘴上说改、
        // 实际没动的情况污染 version 序列)
        if (current != null && current.getConfigJson() != null) {
            if (current.getConfigJson().equals(parsed)) {
                throw new BizException("NO_CHANGE",
                        "新配置跟当前 published 完全一致,未应用。请检查 AI 是否真的处理了指令。");
            }
        }

        int nextVersion = (current == null ? 0 : current.getVersion()) + 1;
        String code = current != null ? current.getCode()
                : String.valueOf(parsed.getOrDefault("code", bizType + "_v1"));
        String name = current != null ? current.getName()
                : String.valueOf(parsed.getOrDefault("name", bizType));
        String module = current != null ? current.getModule()
                : String.valueOf(parsed.getOrDefault("module", bizType));

        // 3. 老 published → disabled
        if (current != null) {
            current.setStatus("disabled");
            definitionMapper.updateById(current);
        }

        // 4. 插新行
        WorkflowDefinition next = new WorkflowDefinition();
        next.setId(IdWorker.getId());
        next.setTenantId(TenantContext.getRequiredTenantId());
        next.setCode(code);
        next.setName(name);
        next.setVersion(nextVersion);
        next.setBizType(bizType);
        next.setCollegeId(collegeId);
        next.setConfigYaml(newYaml);
        next.setConfigJson(parsed);
        next.setStatus("published");
        next.setModule(module);
        definitionMapper.insert(next);

        // 5. leave only:把 type_router 里出现的所有 leave_type_code 同步到 leave_type_config 表
        // (新增的 code 自动 upsert 一行,后续老师可在用户管理改中文 name)
        if ("leave".equals(bizType)) {
            syncLeaveTypesFromYaml(parsed);
        }

        log.info("Applied new YAML for bizType={} collegeId={}: v{}→v{} ({})",
                bizType, collegeId, current == null ? 0 : current.getVersion(),
                nextVersion, changeSummary != null ? changeSummary : "no summary");
        return next;
    }

    @SuppressWarnings("unchecked")
    private void syncLeaveTypesFromYaml(Map<String, Object> parsed) {
        Object nodes = parsed.get("nodes");
        if (!(nodes instanceof List<?> nlist)) return;
        Set<String> codes = new HashSet<>();
        for (Object n : nlist) {
            if (!(n instanceof Map<?, ?> nm)) continue;
            Map<String, Object> node = (Map<String, Object>) nm;
            if (!"type_router".equals(node.get("id"))) continue;
            Object branches = node.get("branches");
            if (!(branches instanceof List<?> bl)) continue;
            for (Object b : bl) {
                if (!(b instanceof Map<?, ?> bm)) continue;
                String when = String.valueOf(((Map<String, Object>) bm).getOrDefault("when", ""));
                // "leave_type_code == 'personal'"
                int eq = when.indexOf("==");
                if (eq < 0) continue;
                String tail = when.substring(eq + 2).trim();
                if (tail.startsWith("'") || tail.startsWith("\"")) {
                    char q = tail.charAt(0);
                    int end = tail.indexOf(q, 1);
                    if (end > 1) codes.add(tail.substring(1, end));
                }
            }
            break;
        }
        for (String code : codes) {
            try {
                // name 暂用 code 兜底,后续老师可改中文(LeaveConfigBaseService.updateLeaveTypeExtraFields
                // 改 extraFields,改 name 走 system 用户管理 / leave_type_config 编辑)。
                leaveTypeMapper.upsertNew(IdWorker.getId(), TenantContext.getRequiredTenantId(), code, code);
            } catch (Exception e) {
                log.warn("syncLeaveTypesFromYaml: upsert {} failed: {}", code, e.getMessage());
            }
        }
    }
}
