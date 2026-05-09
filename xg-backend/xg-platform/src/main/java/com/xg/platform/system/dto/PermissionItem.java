package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 权限矩阵行：一个权限码 + 它在某角色下的状态。前端按这个数据渲染 ☑/☐/locked。
 *
 * <p>source 取值：
 * <ul>
 *   <li>{@code default} —— 来自 DEFAULTS 代码硬编码，granted=true、UI disable</li>
 *   <li>{@code override} —— 来自 sys_role_permission 表，granted=true、UI 可勾掉</li>
 *   <li>{@code null} —— 当前未授予，granted=false、UI 可勾上变 override</li>
 * </ul>
 */
@Getter
@Setter
public class PermissionItem {
    private String code;
    private String name;
    private String module;
    private String source;     // "default" | "override" | null
    private Boolean granted;
}
