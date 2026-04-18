import type { PageResult } from '@xg1/shared';
import api from './index';

export interface SystemUser {
  id: string;
  username: string;
  real_name: string;
  phone: string;
  email: string;
  role_codes: string[];
  status: 'active' | 'disabled';
  last_login_at: string | null;
  created_at: string;
}

export interface UserQueryParams {
  page: number;
  size: number;
  keyword?: string;
  status?: string;
  role_code?: string;
}

export interface CreateUserData {
  username: string;
  real_name: string;
  phone?: string;
  email?: string;
  role_codes: string[];
  password: string;
}

export interface UpdateUserData {
  real_name?: string;
  phone?: string;
  email?: string;
  role_codes?: string[];
  status?: string;
}

export function getUsers(params: UserQueryParams): Promise<PageResult<SystemUser>> {
  return api.get('/system/users', { params }).then((res) => res.data);
}

export function createUser(data: CreateUserData): Promise<SystemUser> {
  return api.post('/system/users', data).then((res) => res.data);
}

export function updateUser(id: string, data: UpdateUserData): Promise<void> {
  return api.put(`/system/users/${id}`, data).then(() => undefined);
}

export function resetPassword(id: string): Promise<void> {
  return api.post(`/system/users/${id}/reset-password`).then(() => undefined);
}

export function toggleUserStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  return api.put(`/system/users/${id}`, { status }).then(() => undefined);
}
