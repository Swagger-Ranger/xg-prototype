import type { PageResult } from '@xg1/shared';
import api from './index';

export interface WorkStudyPosition {
  id: string;
  title: string;
  position_type: string | null;
  department_name: string;
  description: string;
  requirements: string | null;
  prefer_financial_aid: boolean | null;
  hourly_rate: string;
  weekly_hours: number | null;
  headcount: number | null;
  hired_count: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkStudyApplication {
  id: string;
  position_id: string;
  student_id: string;
  student_name: string;
  financial_aid_level: string | null;
  intro: string;
  status: string;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionQueryParams {
  page: number;
  size: number;
  status?: string;
  position_type?: string;
  prefer_financial_aid?: boolean;
}

export interface ApplicationQueryParams {
  page: number;
  size: number;
  position_id?: string;
  student_id?: string;
  status?: string;
}

export interface CreatePositionData {
  title: string;
  position_type?: string;
  department_name: string;
  description: string;
  requirements?: string;
  prefer_financial_aid?: boolean;
  hourly_rate: string;
  weekly_hours?: number;
  headcount?: number;
  start_date?: string;
  end_date?: string;
}

export interface ApplyData {
  position_id: string;
  financial_aid_level?: string;
  intro: string;
}

export interface DecisionData {
  status: 'recommended' | 'hired' | 'rejected';
  decision_note?: string;
}

export function listPositions(params: PositionQueryParams): Promise<PageResult<WorkStudyPosition>> {
  return api.get('/work-study/positions', { params }).then((res) => res.data);
}

export function getPosition(id: string): Promise<WorkStudyPosition> {
  return api.get(`/work-study/positions/${id}`).then((res) => res.data);
}

export function createPosition(data: CreatePositionData): Promise<WorkStudyPosition> {
  return api.post('/work-study/positions', data).then((res) => res.data);
}

export function closePosition(id: string): Promise<void> {
  return api.put(`/work-study/positions/${id}/close`).then(() => undefined);
}

export function listApplications(params: ApplicationQueryParams): Promise<PageResult<WorkStudyApplication>> {
  return api.get('/work-study/applications', { params }).then((res) => res.data);
}

export function apply(data: ApplyData): Promise<WorkStudyApplication> {
  return api.post('/work-study/applications', data).then((res) => res.data);
}

export function decideApplication(id: string, data: DecisionData): Promise<void> {
  return api.put(`/work-study/applications/${id}/decide`, data).then(() => undefined);
}
