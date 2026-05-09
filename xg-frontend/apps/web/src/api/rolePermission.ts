import api from './index';

/**
 * 角色权限管理 API（系统管理 → 角色权限 tab）。所有 endpoint 都要 system:role:manage
 * 权限码，前端只在 hasPermission('system:role:manage') 为真时才渲染入口。
 */

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number | null;
  effective_perm_count: number;
  override_perm_count: number;
}

export interface PermissionCode {
  id: string;
  code: string;
  name: string;
  module: string | null;
  type: string;
  sort_order: number;
}

export interface PermissionItem {
  code: string;
  name: string;
  module: string | null;
  /** 'default' = 来自 DEFAULTS（不可改）; 'override' = DB 自定义加; null = 未授予。 */
  source: 'default' | 'override' | null;
  granted: boolean;
}

export interface RoleDetailView {
  role: RoleSummary;
  permissions: PermissionItem[];
}

export function listRoles(): Promise<RoleSummary[]> {
  return api.get('/system/roles').then((res) => res.data);
}

export function listAllPermissions(): Promise<PermissionCode[]> {
  return api.get('/system/permissions').then((res) => res.data);
}

export function getRoleDetail(code: string): Promise<RoleDetailView> {
  return api.get(`/system/roles/${encodeURIComponent(code)}/perms`).then((res) => res.data);
}

/** 批量加 override 权限。已经是默认权限的会被后端跳过（不报错），返回真正 INSERT 的条数。 */
export function grantRolePerms(code: string, permCodes: string[]): Promise<{ affected: number }> {
  return api
    .post(`/system/roles/${encodeURIComponent(code)}/perms`, { perm_codes: permCodes })
    .then((res) => res.data);
}

/** 撤销一条 override。撤默认权限会被后端拒绝（400）。 */
export function revokeRolePerm(code: string, permCode: string): Promise<void> {
  return api
    .delete(
      `/system/roles/${encodeURIComponent(code)}/perms/${encodeURIComponent(permCode)}`,
    )
    .then(() => undefined);
}
