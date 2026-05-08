import api from './index';

export type NotificationChannel = 'in_app' | 'miniprogram' | 'wecom';
export type NotificationLevel = 'normal' | 'important' | 'urgent';
export type NotificationCategory = 'business' | 'care' | 'system';

export type RecipientType =
  | 'applicant'
  | 'current_approver'
  | 'applicant_counselor'
  | 'applicant_class_master'
  | 'applicant_class_monitor'
  | 'applicant_dean'
  | 'static_user';

export interface RecipientSpec {
  type: RecipientType;
  cc?: boolean;
  user_id?: number;
}

export interface NotificationTemplateRow {
  id: string;
  tenant_id: string;
  code: string;
  category: NotificationCategory;
  biz_module: string;
  title_tmpl: string;
  body_tmpl: string;
  default_channels: NotificationChannel[];
  default_level: NotificationLevel;
  wx_template_id: string | null;
  enabled: boolean;
  description: string | null;
  recipients: RecipientSpec[];
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceRow {
  id: string;
  scope_type: 'role' | 'user';
  scope_value: string;
  template_code: string;
  channels: NotificationChannel[];
  muted: boolean;
  updated_at: string;
}

export interface CareRuleRow {
  id: string;
  code: string;
  biz_module: string;
  trigger_type: string;
  trigger_event: string;
  offset_hours: number;
  template_code: string;
  data_resolver: string | null;
  enabled: boolean;
  description: string | null;
}

const BASE = '/notification-center';

export function listTemplates(): Promise<NotificationTemplateRow[]> {
  return api.get(`${BASE}/templates`).then((res) => res.data);
}

export function updateTemplate(code: string, patch: Partial<NotificationTemplateRow>): Promise<NotificationTemplateRow> {
  return api.put(`${BASE}/templates/${code}`, patch).then((res) => res.data);
}

export function listPreferences(scopeType: 'role' | 'user' = 'role'): Promise<NotificationPreferenceRow[]> {
  return api.get(`${BASE}/preferences`, { params: { scope_type: scopeType } }).then((res) => res.data);
}

export function upsertPreference(input: {
  scope_type: 'role' | 'user';
  scope_value: string;
  template_code: string;
  channels: NotificationChannel[];
  muted?: boolean;
}): Promise<NotificationPreferenceRow> {
  return api.put(`${BASE}/preferences`, input).then((res) => res.data);
}

export function listCareRules(): Promise<CareRuleRow[]> {
  return api.get(`${BASE}/care-rules`).then((res) => res.data);
}

export function setCareRuleEnabled(code: string, enabled: boolean): Promise<CareRuleRow> {
  return api.put(`${BASE}/care-rules/${code}`, { enabled }).then((res) => res.data);
}
