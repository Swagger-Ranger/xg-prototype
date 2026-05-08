import type { PageResult } from '@xg1/shared';
import api from './index';

export interface StudentEventLog {
  id: string;
  tenant_id: string;
  student_id: string;
  event_type: string;
  event_source: string;
  event_data: Record<string, unknown>;
  severity: number;
  occurred_at: string;
  created_at: string;
}

export interface StudentEventQueryParams {
  page: number;
  size: number;
  eventType?: string;
  minSeverity?: number;
}

export function listStudentEvents(
  studentId: string | number,
  params: StudentEventQueryParams,
): Promise<PageResult<StudentEventLog>> {
  return api
    .get(`/students/${studentId}/events`, { params })
    .then((res) => res.data);
}
