package com.xg.platform.workflow.assignee;

import com.xg.platform.system.mapper.SysRoleMapper;
import com.xg.platform.system.model.SysRole;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 工作流受理人能力目录。聚合各 Strategy 通过 {@link AssigneeDescriptorProvider}
 * 登记的静态组合,加上 GlobalRoleStrategy 的动态规则(scope=global 且 role 是
 * 某个 sys_role.code —— role/team 皆可,RBAC 落地方案 §5.3)。
 *
 * <p>只读目录:供 validator(发布前可验证)、编辑器、AI 用同一份能力清单,
 * 运行时解析仍走各 Strategy 本身,二者不耦合。
 */
@Component
@RequiredArgsConstructor
public class AssigneeCatalog {

    private final List<AssigneeDescriptorProvider> providers;
    private final SysRoleMapper sysRoleMapper;

    private List<AssigneeDescriptor> staticDescriptors() {
        List<AssigneeDescriptor> all = new ArrayList<>();
        for (AssigneeDescriptorProvider p : providers) {
            all.addAll(p.descriptors());
        }
        return all;
    }

    private Set<String> roleCodes() {
        Set<String> codes = new HashSet<>();
        for (SysRole r : sysRoleMapper.selectList(null)) {
            if (r.getCode() != null) codes.add(r.getCode());
        }
        return codes;
    }

    /**
     * 该 (role, scope, bizType) 是否有解析能力。供 WorkflowController 校验:
     * 静态目录命中(且 bizType 适用),或 scope=global 且 role 是已存在的 sys_role.code。
     */
    public boolean supports(String role, String scope, String bizType) {
        if (role == null) return false;
        for (AssigneeDescriptor d : staticDescriptors()) {
            if (d.role().equals(role) && Objects.equals(d.scope(), scope)
                    && d.appliesToBizType(bizType)) {
                return true;
            }
        }
        // 短路:只有 scope=global 才查 sys_role,非 global 不打 DB。
        return "global".equals(scope) && roleCodes().contains(role);
    }

    /** 静态目录 + 每个 sys_role 一条 scope=global 动态项(与静态去重),给编辑器/AI。 */
    public List<AssigneeDescriptor> listAll() {
        List<AssigneeDescriptor> out = new ArrayList<>(staticDescriptors());
        Set<String> seen = new HashSet<>();
        for (AssigneeDescriptor d : out) {
            seen.add(d.role() + "|" + d.scope());
        }
        for (SysRole r : sysRoleMapper.selectList(null)) {
            String code = r.getCode();
            if (code == null) continue;
            if (seen.add(code + "|global")) {
                out.add(new AssigneeDescriptor(code, "global", Set.of(),
                        (r.getName() != null ? r.getName() : code) + "（全租户）",
                        false, "dynamic"));
            }
        }
        return out;
    }
}
