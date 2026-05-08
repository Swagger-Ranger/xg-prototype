import type { PageResult } from '@xg1/shared';
import api from './index';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AlertMatchedEvent {
  id: string | number;
  event_type: string;
  occurred_at: string | null;
  summary: string;
}

export interface AlertReFire {
  re_fired_at: string;
  previous_acknowledged_at: string | null;
  previous_acknowledged_by: number | string | null;
  previous_count: number;
  new_count: number;
}

export interface AlertTriggerData {
  explanation?: string;
  rule_hit?: string;
  matched_events?: AlertMatchedEvent[];
  re_fires?: AlertReFire[];
  [key: string]: unknown;
}

export interface StudentAlert {
  id: string;
  tenant_id: string;
  student_id: string;
  alert_rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  trigger_data: AlertTriggerData;
  status: AlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  note: string | null;
  counselor_talk_id: string | null;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertQueryParams {
  page: number;
  size: number;
  status?: AlertStatus;
  severity?: AlertSeverity;
  student_id?: string;
}

export interface AlertSummary {
  open_total: string;
  by_severity: Partial<Record<AlertSeverity, string>>;
}

export function listAlerts(params: AlertQueryParams): Promise<PageResult<StudentAlert>> {
  return api.get('/alerts', { params }).then((res) => res.data);
}

export function getAlertSummary(): Promise<AlertSummary> {
  return api.get('/alerts/summary').then((res) => res.data);
}

export function getAlert(id: string): Promise<StudentAlert> {
  return api.get(`/alerts/${id}`).then((res) => res.data);
}

export function acknowledgeAlert(id: string, note?: string): Promise<void> {
  return api.post(`/alerts/${id}/acknowledge`, { note }).then((res) => res.data);
}

export function resolveAlert(id: string, note?: string): Promise<void> {
  return api.post(`/alerts/${id}/resolve`, { note }).then((res) => res.data);
}

export function markAlertFalsePositive(id: string, note?: string): Promise<void> {
  return api.post(`/alerts/${id}/false-positive`, { note }).then((res) => res.data);
}

export function muteAlert(id: string, days: number, note?: string): Promise<void> {
  return api.post(`/alerts/${id}/mute`, { days, note }).then((res) => res.data);
}

export function triggerAlertScan(): Promise<{ inserted: number }> {
  return api.post('/alerts/scan').then((res) => res.data);
}

export interface AlertRuleStat {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  severity: AlertSeverity;
  enabled: boolean;
  fires: number;
  acked: number;
  resolved: number;
  false_positives: number;
  false_positive_rate: number;
  avg_ack_minutes: number | null;
  last_fired_at: string | null;
}

export function listAlertRuleStats(windowDays = 30): Promise<AlertRuleStat[]> {
  return api.get('/alert-rules/stats', { params: { window_days: windowDays } }).then((res) => res.data);
}

export interface AlertRuleAuthorAttempt {
  errors: string[];
  dsl: Record<string, unknown> | null;
}

export interface AlertRuleAuthorResult {
  ok: boolean;
  dsl?: Record<string, unknown> | null;
  raw_dsl?: Record<string, unknown> | null;
  validation?: { valid: boolean; errors: string[] };
  attempts: AlertRuleAuthorAttempt[];
  error_message?: string | null;
}

export function authorAlertRule(nl: string): Promise<AlertRuleAuthorResult> {
  return api.post('/alert/rule/author', { nl }).then((res) => res.data);
}

export interface AlertRulePreviewSample {
  student_id: number | string;
  student_name: string | null;
  class_name: string | null;
  values: Record<string, unknown>;
}

export interface AlertRulePreviewResult {
  valid: boolean;
  errors?: string[];
  preview?: {
    rule_name: string;
    total_matched: number;
    samples: AlertRulePreviewSample[];
  };
}

export function previewAlertRule(
  dsl: Record<string, unknown>,
  sampleLimit = 10,
): Promise<AlertRulePreviewResult> {
  return api
    .post('/alert/rule/preview', { dsl, sampleLimit })
    .then((res) => res.data);
}

export interface AlertRuleCreateResult {
  ok: boolean;
  id?: string;
  validation?: { valid: boolean; errors: string[] };
  error_message?: string;
}

export function createAlertRule(
  dsl: Record<string, unknown>,
): Promise<AlertRuleCreateResult> {
  return api.post('/alert/rules', { dsl }).then((res) => res.data);
}

export interface AlertRuleDetail {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  severity: AlertSeverity;
  enabled: boolean;
  config: Record<string, unknown>;
}

export function getAlertRule(id: string): Promise<AlertRuleDetail> {
  return api.get(`/alert/rules/${id}`).then((res) => res.data);
}

export function patchAlertRule(
  id: string,
  body: {
    enabled?: boolean;
    dsl?: Record<string, unknown>;
    name?: string;
    description?: string | null;
    severity?: AlertSeverity;
    config?: Record<string, unknown>;
  },
): Promise<AlertRuleCreateResult> {
  return api.patch(`/alert/rules/${id}`, body).then((res) => res.data);
}

export function deleteAlertRule(id: string): Promise<{ ok: boolean }> {
  return api.delete(`/alert/rules/${id}`).then((res) => res.data);
}
