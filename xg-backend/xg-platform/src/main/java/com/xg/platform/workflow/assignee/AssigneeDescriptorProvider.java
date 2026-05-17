package com.xg.platform.workflow.assignee;

import java.util.List;

/**
 * 由 AssigneeStrategy 可选实现:把自己能解析的 (role, scope) 组合登记到
 * {@link AssigneeCatalog}。让"新人看 YAML 不知道怎么解析"变成可查目录,
 * 同时保持运行时解析仍走各 Strategy 自身逻辑(目录只读,不替代解析)。
 */
public interface AssigneeDescriptorProvider {

    List<AssigneeDescriptor> descriptors();
}
