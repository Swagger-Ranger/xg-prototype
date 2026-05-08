import type { LeaveStatus } from '../types/leave';
import type { WorkflowStatus, TaskStatus } from '../types/workflow';

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  draft: '草稿',
  pending: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已撤销',
  cancel_pending: '销假审批中',
  pending_manual_return: '人工销假待审',
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  draft: '#94a3b8',
  pending: '#6366f1',
  approved: '#059669',
  rejected: '#dc2626',
  cancelled: '#94a3b8',
  cancel_pending: '#b45309',
  pending_manual_return: '#d97706',
};

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  running: '进行中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已撤销',
  timeout: '已超时',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
  timeout: '已超时',
};
