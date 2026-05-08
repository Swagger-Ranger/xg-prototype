import { post } from '../utils/request';

/**
 * 前端使用的用户视图（camelCase）。
 * 注意：后端走 Jackson SNAKE_CASE，wire payload 用 real_name / tenant_id / role_codes，
 * 由 login() 在 boundary 处转成 camelCase 后存进 storage，下游访问保持 camelCase 一致。
 */
export interface MiniUser {
  id: string;
  username: string;
  realName: string | null;
  tenantId: string | null;
  roleCodes: string[];
}

export interface LoginPayload {
  username: string;
  password: string;
  tenantId?: string;
}

export interface LoginResp {
  token: string;
  refreshToken: string | null;
  user: MiniUser;
}

/** 后端 wire 形态（snake_case）—— 仅用作 boundary 转换，不外泄。 */
interface WireUser {
  id: string;
  username: string;
  real_name?: string | null;
  tenant_id?: string | null;
  role_codes?: string[];
}

interface WireLoginResp {
  token: string;
  refresh_token?: string | null;
  user: WireUser;
}

export async function login(payload: LoginPayload): Promise<LoginResp> {
  const wire = await post<WireLoginResp>('/auth/login', payload, { skipAuth: true });
  return {
    token: wire.token,
    refreshToken: wire.refresh_token ?? null,
    user: {
      id: wire.user.id,
      username: wire.user.username,
      realName: wire.user.real_name ?? null,
      tenantId: wire.user.tenant_id ?? null,
      roleCodes: wire.user.role_codes ?? [],
    },
  };
}
