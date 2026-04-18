import type { LoginRequest, LoginResponse, UserInfo } from '@xg1/shared';
import api from './index';

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return api
    .post('/auth/login', payload, {
      headers: { 'X-Tenant-Id': payload.tenant_id ?? 'default' },
    })
    .then((res) => res.data);
}

export function fetchMe(): Promise<UserInfo> {
  return api.get('/auth/me').then((res) => res.data);
}
