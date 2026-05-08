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

export interface UpdateMyProfilePayload {
  email?: string | null;
  phone?: string | null;
  /** male / female / unknown / empty string to clear. */
  gender?: string | null;
  avatar_url?: string | null;
}

export function updateMyProfile(payload: UpdateMyProfilePayload): Promise<UserInfo> {
  return api.put('/auth/me/profile', payload).then((res) => res.data);
}

export function changeMyPassword(oldPassword: string, newPassword: string): Promise<void> {
  return api
    .put('/auth/me/password', { old_password: oldPassword, new_password: newPassword })
    .then(() => undefined);
}
