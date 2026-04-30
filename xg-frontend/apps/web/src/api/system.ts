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
  // Camel-cased to match the Java DTO field name — Spring's query-param
  // binding is field-name exact, so role_code (snake) was silently ignored.
  roleCode?: string;
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

// AI metrics aggregation, backing /system "AI 表现" tab
export interface AiMetricsRecommendation {
  total: number;
  agree: number;
  disagree: number;
  unclear: number;
  no_ai: number;
  agreement_rate: number | null;  // percent (e.g. 85.7) or null when no decisions yet
}

export interface AiMetricsField {
  field: string;
  match: number;
  mismatch: number;
  accuracy: number | null;
}

export interface AiMetricsDraft {
  total_with_draft: number;
  fields: AiMetricsField[];
}

export interface AiMetricsDisagreement {
  id: string;
  task_id: string;
  biz_type: string | null;
  ai_recommendation: string | null;
  ai_headline: string | null;
  ai_rationale: string | null;
  human_decision: string;
  human_comment: string | null;
  approver_id: string | null;
  created_at: string;
}

export interface AiMetricsResponse {
  days: number;
  recommendation: AiMetricsRecommendation;
  draft: AiMetricsDraft;
  recent_disagreements: AiMetricsDisagreement[];
}

export function getAiMetrics(days = 7): Promise<AiMetricsResponse> {
  return api.get('/system/ai-metrics', { params: { days } }).then((res) => res.data);
}
