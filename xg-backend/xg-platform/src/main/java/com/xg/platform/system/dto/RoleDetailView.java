package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

/** 单角色详情：基本信息 + 全权限码 × 状态矩阵。 */
@Getter
@Setter
public class RoleDetailView {
    private RoleSummary role;
    private List<PermissionItem> permissions;
}
