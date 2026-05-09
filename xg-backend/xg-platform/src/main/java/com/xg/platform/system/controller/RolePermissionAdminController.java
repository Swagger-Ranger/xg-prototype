package com.xg.platform.system.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.common.base.R;
import com.xg.platform.system.dto.GrantRolePermsRequest;
import com.xg.platform.system.dto.RoleDetailView;
import com.xg.platform.system.dto.RoleSummary;
import com.xg.platform.system.service.RolePermissionAdminService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 「系统管理 → 角色权限」tab 用的 admin API。读、写都要 system:role:manage 权限码。
 *
 * <p>4 个 endpoint：
 * <ul>
 *   <li>GET  /roles                      —— 角色列表 + 有效权限计数</li>
 *   <li>GET  /permissions                —— 全部权限码字典（前端按 module 分组渲染）</li>
 *   <li>GET  /roles/{code}/perms         —— 单角色详情（每个权限码 source/granted）</li>
 *   <li>POST /roles/{code}/perms         —— 批量加 override 权限</li>
 *   <li>DELETE /roles/{code}/perms/{permCode} —— 移除单个 override 权限</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/system")
@RequiredArgsConstructor
public class RolePermissionAdminController {

    private final RolePermissionAdminService service;

    @GetMapping("/roles")
    @SaCheckPermission("system:role:manage")
    public R<List<RoleSummary>> listRoles() {
        return R.ok(service.listRoles());
    }

    @GetMapping("/permissions")
    @SaCheckPermission("system:role:manage")
    public R<List<Map<String, Object>>> listPermissions() {
        return R.ok(service.listAllPermissions());
    }

    @GetMapping("/roles/{code}/perms")
    @SaCheckPermission("system:role:manage")
    public R<RoleDetailView> getRoleDetail(@PathVariable String code) {
        return R.ok(service.getRoleDetail(code));
    }

    @PostMapping("/roles/{code}/perms")
    @SaCheckPermission("system:role:manage")
    public R<Map<String, Integer>> grantPerms(@PathVariable String code,
                                              @RequestBody GrantRolePermsRequest req) {
        int affected = service.grantPerms(code, req);
        return R.ok(Map.of("affected", affected));
    }

    @DeleteMapping("/roles/{code}/perms/{permCode:.+}")
    @SaCheckPermission("system:role:manage")
    public R<Void> revokePerm(@PathVariable String code,
                              @PathVariable String permCode) {
        service.revokePerm(code, permCode);
        return R.ok();
    }
}
