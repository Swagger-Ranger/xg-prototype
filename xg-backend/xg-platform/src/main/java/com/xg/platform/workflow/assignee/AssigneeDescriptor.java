package com.xg.platform.workflow.assignee;

import java.util.Set;

/**
 * 一条"工作流可用受理人"能力声明。把散在各 AssigneeStrategy 里的 (role, scope)
 * 解析能力登记成可被 validator / 编辑器 / AI 读取的目录项(RBAC 落地方案 §5.2)。
 *
 * @param role        DSL 里的 assignee.role
 * @param scope        DSL 里的 assignee.scope
 * @param bizTypes     适用的流程 bizType;空集 = 不限 bizType(如内置班级/学院角色)
 * @param label        中文可读名(给编辑器/AI,不暴露 role code)
 * @param virtual      是否虚拟角色(不进 sys_role,按业务实体解析,如 employer_leader)
 * @param ownerModule  能力归属模块(core / workstudy / ...),便于排查"这受理人哪来的"
 */
public record AssigneeDescriptor(
        String role,
        String scope,
        Set<String> bizTypes,
        String label,
        boolean virtual,
        String ownerModule
) {
    /** 空 bizTypes 视为不限;否则必须显式包含目标 bizType。 */
    public boolean appliesToBizType(String bizType) {
        return bizTypes == null || bizTypes.isEmpty() || bizTypes.contains(bizType);
    }
}
