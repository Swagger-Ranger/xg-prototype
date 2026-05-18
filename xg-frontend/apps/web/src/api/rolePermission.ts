import api, { handleUnauthorized } from './index';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 角色权限管理 API（系统管理 → 角色权限 tab）。所有 endpoint 都要 system:role:manage
 * 权限码，前端只在 hasPermission('system:role:manage') 为真时才渲染入口。
 */

/** sys_role.kind:'role' = 角色权限页用,'team' = 团队管理页用。 */
export type RoleKind = 'role' | 'team';

/** sys_role.team_type:仅 kind='team' 有意义。 */
export type TeamType = 'review' | 'temporary' | 'cross_dept' | 'student_org' | 'other';

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number | null;
  effective_perm_count: number;
  override_perm_count: number;
  /** 'role' | 'team' */
  kind: RoleKind;
  team_type: TeamType | null;
  /** ISO yyyy-MM-dd,kind='team' 才有值,可空(常驻) */
  start_date: string | null;
  end_date: string | null;
  /** ISO timestamp,非空 = 已归档 */
  archived_at: string | null;
  /** sys_user_role 行数 */
  member_count: number;
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

export interface ListRolesQuery {
  /** 'role' / 'team' / 不传(全部) */
  kind?: RoleKind;
  /** 仅 kind='team' 用:true 只看已归档,false 只看未归档 */
  archived?: boolean;
  /** name 模糊匹配 */
  keyword?: string;
}

export function listRoles(query: ListRolesQuery = {}): Promise<RoleSummary[]> {
  return api.get('/system/roles', { params: query }).then((res) => res.data);
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

// ===== 自定义角色 CRUD =====

export interface CreateRoleRequest {
  /** kind='role' 必填;kind='team' 可省,服务端自动生成。 */
  code?: string;
  name: string;
  description?: string;
  /** 优先用 — 给定一组权限码作为初始 override(不存在的码会被后端跳过)。 */
  initial_permission_codes?: string[];
  /** 备选:从已有角色复制 effective 权限(与上互斥时优先用上)。 */
  copy_from_role_code?: string;
  /** 'role'(默认) | 'team' */
  kind?: RoleKind;
  /** 仅 kind='team' */
  team_type?: TeamType | null;
  /** ISO yyyy-MM-dd,可空 */
  start_date?: string | null;
  end_date?: string | null;
}

export function createRole(req: CreateRoleRequest): Promise<RoleSummary> {
  return api.post('/system/roles', req).then((res) => res.data);
}

export interface UpdateRoleRequest {
  name: string;
  description?: string;
  /** 仅 team 行:这 3 个跟着改;role 行后端忽略。 */
  team_type?: TeamType | null;
  start_date?: string | null;
  end_date?: string | null;
}

export function updateRole(code: string, req: UpdateRoleRequest): Promise<void> {
  return api
    .put(`/system/roles/${encodeURIComponent(code)}`, req)
    .then(() => undefined);
}

export function deleteRole(code: string): Promise<void> {
  return api
    .delete(`/system/roles/${encodeURIComponent(code)}`)
    .then(() => undefined);
}

/** 归档团队(仅 kind='team' 有效)。 */
export function archiveTeam(code: string): Promise<void> {
  return api
    .post(`/system/roles/${encodeURIComponent(code)}/archive`)
    .then(() => undefined);
}

/** 撤销归档。 */
export function unarchiveTeam(code: string): Promise<void> {
  return api
    .post(`/system/roles/${encodeURIComponent(code)}/unarchive`)
    .then(() => undefined);
}

// ===== AI 助手推荐 =====

export interface RoleAiProposal {
  code: string;
  name: string;
  description: string;
  permission_codes: string[];
  ai_message: string;
  error_code: string | null;
}

/** 调 sidecar 让小夕根据自然语言指令推荐 code / name / 权限。失败时 ai_message 携带原因。
 *
 * 走原生 fetch（不走 axios 实例）— 与 AIPanel 里 workflow/notification propose 一致；
 * 手动把 token / tenant / user / role 拼到 header 上，让 sidecar 透传给 backend
 * 的 Sa-Token 拦截器，否则后端 `system:role:manage` 检查会 401。
 */
export function proposeRoleConfig(instruction: string): Promise<RoleAiProposal> {
  const { token, user } = useAuthStore.getState();
  const tenantId = user?.tenant_id || 'default';
  const userId = user?.id ? String(user.id) : '';
  const userRole = user?.role_codes?.[0] || 'school_admin';
  return fetch('/ai/api/v1/role-config/propose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-User-Id': userId,
      'X-Tenant-Id': tenantId,
      'X-User-Role': userRole,
    },
    body: JSON.stringify({ instruction }),
  }).then(async (res) => {
    if (res.status === 401) {
      // sidecar require_roles 反向校验 Java /auth/me/perms,token 失效会回 401;
      // 走和 axios 拦截器同样的清 token + 跳登录,避免用户被困在过期会话里
      handleUnauthorized();
      throw new Error('登录已失效,请重新登录');
    }
    if (!res.ok) throw new Error(`AI sidecar HTTP ${res.status}`);
    return res.json();
  });
}
