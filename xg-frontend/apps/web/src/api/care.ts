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

/** 对齐后端 CareTaskView（W1 §4.5：无 rule_id / assigned_to / 原始 trigger_data） */
export interface CareTaskView {
  taskId: number;
  studentId: number;
  studentName: string | null;
  className: string | null;
  severity: CareSeverity;
  status: CareStatus;
  triggerSummary: string;
  dueAt: string;
  briefSummary: string | null;
  briefStatus: CareBriefStatus;
  rescheduleCount: number | null;
  acceptedAt: string | null;
  closedAt: string | null;
  closedReason: string | null;
  transferredTo: string | null;
  createdAt: string;
  updatedAt: string;
  /** detail 专属，列表为 null */
  historyCount: number | null;
  triggerEvidence: Record<string, unknown> | null;
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
  return api
    .post(`/care/tasks/${id}/reject`, { reasonCode, reasonDetail })
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
    .post(`/care/tasks/${id}/transfer`, { targetDept, reasonDetail })
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
