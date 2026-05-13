import api from './index';

export type InsightSeverity = 'info' | 'warn' | 'critical';

export type InsightRefType = 'metric' | 'student' | 'alert' | 'counselor' | 'notification' | 'form';

export interface InsightRef {
  type: InsightRefType;
  id: string;
  label: string;
}

export interface InsightAction {
  type: 'pin_and_review' | 'navigate' | string;
  label: string;
  payload?: {
    refs?: { type: string; id: string | number; label: string; detail?: string }[];
    page?: string;
    params?: Record<string, string>;
  };
}

export interface InsightItem {
  severity: InsightSeverity;
  category: string;
  title: string;
  detail: string;
  suggestion: string;
  evidence?: string[];
  action?: InsightAction | null;
  refs?: InsightRef[];
}

/** Jackson serializes Long as string (JS precision safety), so counts are strings on the wire. */
export interface FeedbackCount {
  up: string;
  down: string;
}

export interface WorkspaceInsight {
  id: string | null;
  role: 'counselor' | 'dean';
  scope_key: string;
  generated_at: string;
  expired_at: string | null;
  model: string;
  metrics: string;   // raw JSON string
  insights: string;  // raw JSON string
  status: 'ready' | 'error' | 'pending';
  error_message: string | null;
  /** itemIndex(string) -> {up, down} — Jackson stringifies integer map keys and Long values. */
  feedback_counts?: Record<string, FeedbackCount>;
  user_votes?: Record<string, 'up' | 'down'>;
}

export function getLatestInsight(
  role: 'counselor' | 'dean',
  classId?: number | string | null,
): Promise<WorkspaceInsight | null> {
  const params: Record<string, string | number> = { role };
  if (classId != null && classId !== '') params.classId = classId;
  return api.get('/insights', { params }).then((res) => res.data);
}

export function refreshInsight(
  role: 'counselor' | 'dean',
  classId?: number | string | null,
): Promise<WorkspaceInsight> {
  const params: Record<string, string | number> = { role };
  if (classId != null && classId !== '') params.classId = classId;
  return api.post('/insights/refresh', null, { params }).then((res) => res.data);
}

export function submitInsightFeedback(
  insightId: string,
  itemIndex: number,
  action: 'up' | 'down',
): Promise<void> {
  return api
    .post(`/insights/${insightId}/feedback`, null, { params: { itemIndex, action } })
    .then(() => undefined);
}

export function parseInsights(raw: string | null | undefined): InsightItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface DeanMetrics {
  scope?: string;
  total_students?: number;
  total_counselors?: number;
  alerts_open_total?: number;
  alerts_by_severity?: Record<string, number>;
  leave_pending?: number;
  leave_submitted_last_7d?: number;
  leave_submitted_prev_7d?: number;
  violations_last_30d?: number;
  checkin_late_last_7d?: number;
  top_counselor_workload?: Array<{ name: string; pending: number }>;
}

export interface CounselorMetrics {
  scope?: string;
  counselor_id?: number;
  class_id?: number;
  class_name?: string;
  class_student_count?: number;
  empty_class?: boolean;
  access_denied?: boolean;
  leave_pending?: number;
  leave_uncancelled_overdue?: number;
  alerts_open?: number;
  alerts_critical?: number;
  violations_last_30d?: number;
  checkin_late_last_7d?: number;
}

export interface AdminFailedNotif {
  id: number | string;
  notification_id: number | string;
  user_id: number;
  user_name?: string;
  title?: string;
  channel: string;
  last_error?: string;
  retry_count?: number;
  created_at: string;
}

export interface AdminStuckWorkflow {
  id: number | string;
  biz_type: string;
  biz_id?: number;
  current_node_id: string;
  definition_name?: string;
  initiator_id?: number;
  initiator_name?: string;
  started_at: string;
}

export interface AdminDraftWorkflow {
  id: number | string;
  name: string;
  module: string;
  version: number;
  updated_at: string;
}

export interface AdminAuditEntry {
  id: number | string;
  action: string;
  module: string;
  target_type?: string;
  target_id?: number;
  description?: string;
  created_at: string;
}

export interface AdminMetrics {
  scope?: string;
  workflow_completed_7d?: number;
  workflow_finished_7d?: number;
  notif_sent_24h?: number;
  notif_total_24h?: number;
  today_active_users?: number;
  notif_failures_24h?: AdminFailedNotif[];
  stuck_workflows?: AdminStuckWorkflow[];
  my_workflow_drafts?: AdminDraftWorkflow[];
  my_recent_audits?: AdminAuditEntry[];
}

export function getWorkspaceMetrics(role: 'dean'): Promise<DeanMetrics>;
export function getWorkspaceMetrics(role: 'counselor'): Promise<CounselorMetrics>;
export function getWorkspaceMetrics(role: 'school_admin'): Promise<AdminMetrics>;
export function getWorkspaceMetrics(
  role: 'dean' | 'counselor' | 'school_admin',
): Promise<DeanMetrics | CounselorMetrics | AdminMetrics> {
  return api.get('/workspace/metrics', { params: { role } }).then((res) => res.data);
}
