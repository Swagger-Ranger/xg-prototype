import type { LeaveTypeConfig, LeaveRequest } from '@xg1/shared';
import type { PageResult } from '@xg1/shared';
import api from './index';

export interface LeaveApplyData {
  leave_type_code: string;
  start_time: string;
  end_time: string;
  reason: string;
  attachment_file_ids?: string[];
  extra_data?: Record<string, unknown>;
}

export interface LeaveQueryParams {
  page: number;
  size: number;
  status?: string;
  leave_type_code?: string;
  start_date?: string;
  end_date?: string;
}

export function getLeaveTypes(): Promise<LeaveTypeConfig[]> {
  return api.get('/leave-types').then((res) => res.data);
}

export function applyLeave(data: LeaveApplyData): Promise<LeaveRequest> {
  return api.post('/leaves', data).then((res) => res.data);
}

export function getMyLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/my', { params }).then((res) => res.data);
}

export function getLeaveDetail(id: string): Promise<LeaveRequest> {
  return api.get(`/leaves/${id}`).then((res) => res.data);
}

export function withdrawLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/withdraw`).then(() => undefined);
}

export function cancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/cancel`).then(() => undefined);
}

export function getClassLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/class', { params }).then((res) => res.data);
}

export function getUncancelledLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/uncancelled', { params }).then((res) => res.data);
}

export function confirmCancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/cancel-confirm`).then(() => undefined);
}

export function forceCancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/force-cancel`).then(() => undefined);
}

export function getLeaveStats(params: Record<string, unknown>): Promise<unknown> {
  return api.get('/leaves/stats', { params }).then((res) => res.data);
}
