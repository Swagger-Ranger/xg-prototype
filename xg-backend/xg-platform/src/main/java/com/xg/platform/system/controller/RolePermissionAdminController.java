package com.xg.platform.system.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.common.base.R;
import com.xg.platform.system.dto.CreateRoleRequest;
import com.xg.platform.system.dto.GrantRolePermsRequest;
import com.xg.platform.system.dto.RoleDetailView;
import com.xg.platform.system.dto.RoleEffectiveMatrixItem;
import com.xg.platform.system.dto.RoleSummary;
import com.xg.platform.system.dto.UpdateRoleRequest;
import com.xg.platform.system.service.RolePermissionAdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 「系统管理 → 角色权限 / 团队管理」用的 admin API。读、写都要 system:role:manage 权限码。
 *
 * <p>endpoint:
 * <ul>
 *   <li>GET    /roles?kind=...&archived=...&keyword=... — 角色 / 团队列表(可过滤)</li>
 *   <li>GET    /permissions                            — 全部权限码字典</li>
 *   <li>GET    /roles/{code}/perms                     — 单角色详情</li>
 *   <li>POST   /roles/{code}/perms                     — 批量加 override 权限</li>
 *   <li>DELETE /roles/{code}/perms/{permCode}          — 移除单个 override</li>
 *   <li>POST   /roles                                  — 新建角色 / 团队</li>
 *   <li>PUT    /roles/{code}                           — 改 name / description / team 字段</li>
 *   <li>DELETE /roles/{code}                           — 软删除</li>
 *   <li>POST   /roles/{code}/archive                   — 归档团队</li>
 *   <li>POST   /roles/{code}/unarchive                 — 撤归档</li>
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
    public R<List<RoleSummary>> listRoles(@RequestParam(required = false) String kind,
                                          @RequestParam(required = false) Boolean archived,
                                          @RequestParam(required = false) String keyword) {
        return R.ok(service.listRoles(kind, archived, keyword));
    }

    @GetMapping("/permissions")
    @SaCheckPermission("system:role:manage")
    public R<List<Map<String, Object>>> listPermissions() {
        return R.ok(service.listAllPermissions());
    }

    /** §8.2 审计导出:全 kind='role' 角色的 default/override/effective 权限码矩阵。 */
    @GetMapping("/roles/effective-matrix")
    @SaCheckPermission("system:role:manage")
    public R<List<RoleEffectiveMatrixItem>> effectiveMatrix() {
        return R.ok(service.effectiveMatrix());
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

    /** 新建自定义角色 / 团队。请求体里 kind 决定 'role' 或 'team'。 */
    @PostMapping("/roles")
    @SaCheckPermission("system:role:manage")
    public R<RoleSummary> createRole(@RequestBody @Valid CreateRoleRequest req) {
        return R.ok(service.createRole(req));
    }

    /** 改 name / description(team 行同时改 team_type / dates)。内置角色被服务层拒绝。 */
    @PutMapping("/roles/{code}")
    @SaCheckPermission("system:role:manage")
    public R<Void> updateRole(@PathVariable String code,
                              @RequestBody @Valid UpdateRoleRequest req) {
        service.updateRole(code, req);
        return R.ok();
    }

    /** 软删除自定义角色 / 团队。有用户绑定时拒绝。 */
    @DeleteMapping("/roles/{code}")
    @SaCheckPermission("system:role:manage")
    public R<Void> deleteRole(@PathVariable String code) {
        service.deleteRole(code);
        return R.ok();
    }

    /** 归档团队 — 仅 kind='team' 行有效。 */
    @PostMapping("/roles/{code}/archive")
    @SaCheckPermission("system:role:manage")
    public R<Void> archiveTeam(@PathVariable String code) {
        service.archiveTeam(code);
        return R.ok();
    }

    /** 撤归档。 */
    @PostMapping("/roles/{code}/unarchive")
    @SaCheckPermission("system:role:manage")
    public R<Void> unarchiveTeam(@PathVariable String code) {
        service.unarchiveTeam(code);
        return R.ok();
    }
}
