/**
 * Workflow API client (审批侧).
 *
 * 仅暴露 mini 端审批所需端点：待审 list + 批准 + 驳回。
 * 后端 ApprovalRequest / BatchApproveRequest 把 operator_id 声明为 @NotNull
 * 且只读 body（不读 X-User-Id），所以 approve/reject 调用必须把 userId 塞进
 * 请求体——不能依赖 request 层的 header 注入。
 */
import Taro from '@tarojs/taro';
import { get, post } from '../utils/request';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface MiniPendingTask {
  id: string;                 // task_id
  workflow_instance_id: string;
  node_id: string;
  node_name: string;
  assignee_id: string;
  due_at: string | null;
  assigned_at: string | null;

  biz_type: string | null;    // 'leave' / 'work_study_application' / ...
  biz_id: string | null;
  initiator_id: string | null;
  initiator_name: string | null;
  started_at: string | null;

  risk_level: RiskLevel;
  reasons: string[];

  // leave 专属冗余字段（biz_type === 'leave' 时由后端填充）
  leave_duration_days: string | null;
  leave_type_name: string | null;
  leave_reason: string | null;
  leave_start_time: string | null;
  leave_end_time: string | null;
}

export interface MiniPage<T> {
  data: T[];
  total: number | string;
}

export interface PendingQuery {
  page: number;
  size: number;
  assigneeId: string;
}

export function listPendingEnriched(params: PendingQuery) {
  return get<MiniPage<MiniPendingTask>>('/workflows/tasks/pending-enriched', {
    page: params.page,
    size: params.size,
    assigneeId: params.assigneeId,
  });
}

function operatorId(): string {
  return String(Taro.getStorageSync('userId') || '');
}

export function approveTask(taskId: string, comment?: string) {
  return post<void>(`/workflows/tasks/${taskId}/approve`, {
    comment,
    operator_id: operatorId(),
  });
}

export function rejectTask(taskId: string, comment?: string) {
  return post<void>(`/workflows/tasks/${taskId}/reject`, {
    comment,
    operator_id: operatorId(),
  });
}
