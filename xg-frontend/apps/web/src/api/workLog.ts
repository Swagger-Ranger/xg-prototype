import type { PageResult } from '@xg1/shared';
import api from './index';

export interface WorkLog {
  id: string;
  category: string;
  title: string;
  content: string;
  log_date: string;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkLogQueryParams {
  page: number;
  size: number;
  category?: string;
  start_date?: string;
  end_date?: string;
}

export interface CreateWorkLogData {
  category: string;
  title: string;
  content: string;
  log_date: string;
}

export function listWorkLogs(params: WorkLogQueryParams): Promise<PageResult<WorkLog>> {
  return api.get('/work-logs', { params }).then((res) => res.data);
}

export function createWorkLog(data: CreateWorkLogData): Promise<WorkLog> {
  return api.post('/work-logs', data).then((res) => res.data);
}

export function deleteWorkLog(id: string): Promise<void> {
  return api.delete(`/work-logs/${id}`).then(() => undefined);
}
