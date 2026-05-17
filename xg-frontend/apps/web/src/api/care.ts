import type { PageResult } from '@xg1/shared';
import api from './index';

export type CareSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CareStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'transferred'
  | 'overdue';
export type CareBriefStatus = 'ready' | 'pending';

/**
 * 对齐后端 CareTaskView（W1 §4.5：无 rule_id / assigned_to / 原始 trigger_data）。
 * 后端全局 jackson SNAKE_CASE，字段名用下划线，与 alert.ts / shared 一致。
 */
export interface CareTaskView {
  task_id: number;
  student_id: number;
  student_name: string | null;
  class_name: string | null;
  severity: CareSeverity;
  status: CareStatus;
  trigger_summary: string;
  due_at: string;
  brief_summary: string | null;
  brief_status: CareBriefStatus;
  reschedule_count: number | null;
  accepted_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  transferred_to: string | null;
  created_at: string;
  updated_at: string;
  /** detail 专属，列表为 null */
  history_count: number | null;
  trigger_evidence: Record<string, unknown> | null;
}

/** AI brief 输出（PRD §11.3）；缺失时后端返回 null（触发懒加载） */
export interface CareBrief {
  why?: string;
  talking_points?: string[];
  avoid_topics?: string[];
  campus_resources?: string[];
  follow_up_days?: number;
  [key: string]: unknown;
}

export interface CareTaskQuery {
  statuses?: CareStatus[];
  severities?: CareSeverity[];
  studentId?: number;
  rescheduleAtLeast?: number;
  includeOverdue?: boolean;
  /** 'all' 仅管理角色生效（W2.5 服务端角色闸）；默认 self */
  assigneeScope?: 'self' | 'all';
  sort?: string;
  page?: number;
  size?: number;
}

export type RejectReasonCode =
  | 'rule_not_applicable'
  | 'student_special_case'
  | 'handled_offline'
  | 'already_transferred'
  | 'other';

export type TransferTargetDept =
  | 'counseling_center'
  | 'aid_office'
  | 'academic_affairs'
  | 'security';

export const RESCHEDULE_DAYS = [1, 3, 7] as const;

function toParams(q: CareTaskQuery): Record<string, unknown> {
  // 后端 @ModelAttribute List<String> 走逗号绑定（WebDataBinder 默认按 , 拆）
  return {
    statuses: q.statuses?.length ? q.statuses.join(',') : undefined,
    severities: q.severities?.length ? q.severities.join(',') : undefined,
    studentId: q.studentId,
    rescheduleAtLeast: q.rescheduleAtLeast,
    includeOverdue: q.includeOverdue,
    assigneeScope: q.assigneeScope,
    sort: q.sort,
    page: q.page,
    size: q.size,
  };
}

export function listCareTasks(q: CareTaskQuery): Promise<PageResult<CareTaskView>> {
  return api.get('/care/tasks', { params: toParams(q) }).then((res) => res.data);
}

export function getCareTask(id: number | string): Promise<CareTaskView> {
  return api.get(`/care/tasks/${id}`).then((res) => res.data);
}

export function acceptCareTask(id: number | string): Promise<void> {
  return api.post(`/care/tasks/${id}/accept`).then((res) => res.data);
}

export function resolveCareTask(id: number | string, note?: string): Promise<void> {
  return api.post(`/care/tasks/${id}/resolve`, { note }).then((res) => res.data);
}

export function rejectCareTask(
  id: number | string,
  reasonCode: RejectReasonCode,
  reasonDetail?: string,
): Promise<void> {
  // 后端 SNAKE_CASE 反序列化：body 字段须下划线
  return api
    .post(`/care/tasks/${id}/reject`, { reason_code: reasonCode, reason_detail: reasonDetail })
    .then((res) => res.data);
}

export function rescheduleCareTask(id: number | string, days: number): Promise<void> {
  return api.post(`/care/tasks/${id}/reschedule`, { days }).then((res) => res.data);
}

export function transferCareTask(
  id: number | string,
  targetDept: TransferTargetDept,
  reasonDetail: string,
): Promise<void> {
  return api
    .post(`/care/tasks/${id}/transfer`, { target_dept: targetDept, reason_detail: reasonDetail })
    .then((res) => res.data);
}

/** 当前 AI brief；后端无可用 brief 时 data 为 null */
export function getCareBrief(id: number | string): Promise<CareBrief | null> {
  return api.get(`/care/tasks/${id}/brief`).then((res) => res.data);
}

/** 重新分析；manual_refresh 命中 5 分钟限流时后端抛中文 BizException */
export function refreshCareBrief(id: number | string): Promise<void> {
  return api.post(`/care/tasks/${id}/brief/refresh`).then((res) => res.data);
}

// ─────────────────── 规则运维（PRD §6.3/§14.1）需 alert:rule:manage ───────────────────

/** 内置规则一行（rule_id 在运维侧需展示，与 W1 §4.5 工作台侧约束无关）。 */
export interface CareRuleItem {
  rule_id: string;
  name: string;
  category: string;
  severity: CareSeverity;
  enabled: boolean;
}

export interface CareRuleListResponse {
  rules: CareRuleItem[];
  /** 全局严重度偏移 -1 / 0 / 1 */
  severity_offset: number;
  rule_version: string;
  /** 下次预计规则集更新日期 yyyy-MM-dd */
  next_update: string;
}

export interface CareRejectReasonStat {
  code: string;
  label: string;
  count: number;
}

export interface CareEffectReportRule {
  rule_id: string;
  name: string;
  category: string;
  triggered: number;
  /** 0~1 比率，前端格式化为百分比 */
  accept_rate: number;
  resolve_rate: number;
  avg_close_hours: number;
  false_positive_rate: number;
  reject_reasons: CareRejectReasonStat[];
  hints: string[];
}

export interface CareEffectReport {
  window_days: number;
  rule_version: string;
  rules: CareEffectReportRule[];
}

export function listCareRules(): Promise<CareRuleListResponse> {
  return api.get('/care/rules').then((res) => res.data);
}

export function toggleCareRule(ruleId: string, enabled: boolean): Promise<void> {
  // 后端 SNAKE_CASE 反序列化；单字段 enabled 无大小写差异，保持显式
  return api
    .post(`/care/rules/${ruleId}/toggle`, { enabled })
    .then((res) => res.data);
}

export function setCareSeverityOffset(offset: number): Promise<void> {
  return api
    .post('/care/rules/severity-offset', { offset })
    .then((res) => res.data);
}

export function getCareEffectReport(): Promise<CareEffectReport> {
  return api.get('/care/rules/effect-report').then((res) => res.data);
}

// ─────────────────── 院系/学校管理视图（PRD §15.2）角色服务端解析 ───────────────────

export interface CareAdminSummary {
  week_total: number;
  done: number;
  in_progress: number;
  overdue: number;
  /** 触发最多规则：中文名 + 命中数（后端已脱 rule_id，不点名学生/辅导员）*/
  top_rules: { rule: string; count: number }[];
  severity_dist: { severity: CareSeverity; count: number }[];
}

export interface CareOverdueItem {
  task_id: number;
  student_name: string | null;
  class_name: string | null;
  /** 任务类型（category），非 rule_id（W1 §4.5）*/
  category: string | null;
  severity: CareSeverity;
  due_at: string;
}

export interface CareOverdueResp {
  total: number;
  items: CareOverdueItem[];
}

export interface CareTrendPoint {
  week_start: string;
  count: number;
}
export interface CareTrends {
  since: string;
  series: { rule: string; points: CareTrendPoint[] }[];
}

export interface CareDrillTask {
  task_id: number;
  category: string | null;
  severity: CareSeverity;
  status: CareStatus;
  created_at: string;
  closed_at?: string | null;
}
export interface CareDrillAuditEntry {
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_role: string | null;
  created_at: string;
}
export interface CareDrillResult {
  student_id: number;
  tasks: CareDrillTask[];
  audit: CareDrillAuditEntry[];
  quota: { used: number; limit: number | null; near_limit: boolean };
}

export interface CareDrillLogItem {
  actor_id: number;
  actor_role: string | null;
  actor_name: string | null;
  student_id: string;
  reason: string;
  created_at: string;
}
export interface CareDrillLogResp {
  total: number;
  items: CareDrillLogItem[];
}

export function getCareAdminSummary(): Promise<CareAdminSummary> {
  return api.get('/care/admin/summary').then((res) => res.data);
}

export function getCareOverdue(page = 1, size = 20): Promise<CareOverdueResp> {
  return api
    .get('/care/admin/overdue', { params: { page, size } })
    .then((res) => res.data);
}

export function getCareTrends(days?: number): Promise<CareTrends> {
  return api
    .get('/care/admin/trends', { params: { days } })
    .then((res) => res.data);
}

/** 督办：领导界面只显示"已督办"，后端走 Orchestrator 私下提醒责任辅导员 */
export function urgeCareTask(taskId: number | string): Promise<void> {
  return api.post(`/care/admin/tasks/${taskId}/urge`).then((res) => res.data);
}

/** 下钻：理由 ≥30 字（后端 DTO 强校验）；配额满抛中文 BizException */
export function drillDownStudent(
  studentId: number | string,
  reason: string,
): Promise<CareDrillResult> {
  return api
    .post(`/care/admin/drill-down/${studentId}`, { reason })
    .then((res) => res.data);
}

export function getCareDrillLog(page = 1, size = 20): Promise<CareDrillLogResp> {
  return api
    .get('/care/admin/drill-down/log', { params: { page, size } })
    .then((res) => res.data);
}
