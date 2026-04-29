import { post } from '../utils/request';

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

export function login(payload: LoginPayload): Promise<LoginResp> {
  return post<LoginResp>('/auth/login', payload, { skipAuth: true });
}
