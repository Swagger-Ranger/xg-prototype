package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * "角色权限"管理页左侧列表的一行：角色基本信息 + 有效权限数。
 * effectivePermCount = |DEFAULTS[code] ∪ sys_role_permission rows|。
 */
@Getter
@Setter
public class RoleSummary {
    private Long id;
    private String code;
    private String name;
    private String description;
    private Boolean isBuiltin;
    private Integer sortOrder;

    /** 这个角色实际能用的权限码总数（DEFAULTS + DB override 去重后）。 */
    private Integer effectivePermCount;

    /** 仅 DB 表里挂的"额外"权限数（排除 DEFAULTS）。便于 UI 显示"自定义 N 项"角标。 */
    private Integer overridePermCount;
}
