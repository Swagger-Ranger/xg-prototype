import type { PageResult, TaskInstance } from '@xg1/shared';
import api from './index';

export interface TaskQueryParams {
  page: number;
  size: number;
  assigneeId?: string;
}

export function getPendingTasks(params: TaskQueryParams): Promise<PageResult<TaskInstance>> {
  return api.get('/workflows/tasks/pending', { params }).then((res) => res.data);
}

export function getTaskHistory(params: TaskQueryParams): Promise<PageResult<TaskInstance>> {
  return api.get('/workflows/tasks/history', { params }).then((res) => res.data);
}

export function approveTask(taskId: string, comment?: string): Promise<void> {
  return api.post(`/workflows/tasks/${taskId}/approve`, { comment }).then(() => undefined);
}

export function rejectTask(taskId: string, comment?: string): Promise<void> {
  return api.post(`/workflows/tasks/${taskId}/reject`, { comment }).then(() => undefined);
}

export function batchApproveTasks(taskIds: string[], action: 'approve' | 'reject', comment?: string): Promise<unknown> {
  return api.post('/workflows/tasks/batch-approve', { task_ids: taskIds, action, comment }).then((res) => res.data);
}
