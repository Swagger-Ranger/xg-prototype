import type { PageResult } from '@xg1/shared';
import api from './index';

export interface CheckinActivity {
  id: string;
  title: string;
  creator_id: string;
  checkin_mode: 'qr_scan' | 'roll_call';
  expected_count: number;
  late_threshold_minutes: number;
  start_time: string;
  end_time: string;
  enable_checkout: boolean;
  status: 'active' | 'closed';
  created_at: string;
}

export interface CheckinRecord {
  id: string;
  activity_id: string;
  student_id: string;
  student_name?: string;
  status: 'on_time' | 'late' | 'absent';
  checked_in_at: string | null;
  source: string;
  note: string | null;
}

export interface QrCodeData {
  payload: string;
  expires_at: string;
  activity_title: string;
  signed_count: number;
  expected_count: number;
}

export interface CreateActivityData {
  title: string;
  duration_minutes: number;
  checkin_mode?: 'qr_scan' | 'roll_call';
  late_threshold_minutes?: number;
  enable_checkout?: boolean;
}

export interface GetMyActivitiesParams {
  page: number;
  size: number;
  status?: string;
}

export function getMyActivities(params: GetMyActivitiesParams): Promise<PageResult<CheckinActivity>> {
  return api.get('/checkins/activities', { params }).then((res) => res.data);
}

export function createActivity(data: CreateActivityData): Promise<CheckinActivity> {
  return api.post('/checkins/activities', data).then((res) => res.data);
}

export function getActivity(id: string): Promise<CheckinActivity> {
  return api.get(`/checkins/activities/${id}`).then((res) => res.data);
}

export function getQrCode(id: string): Promise<QrCodeData> {
  return api.get(`/checkins/activities/${id}/qrcode`).then((res) => res.data);
}

export function closeActivity(id: string): Promise<void> {
  return api.post(`/checkins/activities/${id}/close`).then(() => undefined);
}

export function getRecords(id: string): Promise<CheckinRecord[]> {
  return api.get(`/checkins/activities/${id}/records`).then((res) => res.data);
}
