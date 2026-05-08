import api from './index';

/**
 * 销假配置 API。销假改造后没有 workflow YAML,只有「校园围栏(GPS 销假判定圈)」
 * 这一组数,后续接入门禁系统时再加 access_card 配置。
 */

export interface CampusGeofence {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  /** 是否启用 GPS 销假。false 时学生只能走人工销假兜底。 */
  enabled: boolean;
}

export function getCampusGeofence(): Promise<CampusGeofence> {
  return api.get('/leave-return/campus-geofence').then((res) => res.data);
}

export function updateCampusGeofence(g: CampusGeofence): Promise<CampusGeofence> {
  return api.put('/leave-return/campus-geofence', g).then((res) => res.data);
}

export interface PendingManualReturnItem {
  id: number;
  student_id: number;
  student_name?: string;
  leave_type_name?: string;
  start_time: string;
  end_time: string;
  status: string;
  manual_return_reason?: string | null;
  manual_return_attachments?: unknown;
  manual_return_submitted_at?: string | null;
}

export function reviewManualReturn(leaveId: number, approve: boolean): Promise<PendingManualReturnItem> {
  return api
    .post(`/leaves/${leaveId}/return/manual-review`, { approve })
    .then((res) => res.data);
}
