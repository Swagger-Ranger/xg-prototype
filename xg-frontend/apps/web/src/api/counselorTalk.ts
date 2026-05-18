import type { PageResult } from '@xg1/shared';
import api from './index';

export type CounselorTalkTopic = 'academic' | 'mental' | 'discipline' | 'career' | 'other';

export interface CounselorTalk {
  id: string;
  student_id: string;
  student_name: string;
  counselor_id: string;
  counselor_name: string;
  topic: CounselorTalkTopic;
  content: string;
  follow_up: string | null;
  talk_at: string;
  source_alert_id: string | null;
  source_care_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounselorTalkQueryParams {
  page: number;
  size: number;
  student_id?: string;
  counselor_id?: string;
  topic?: CounselorTalkTopic;
}

export interface CreateCounselorTalkData {
  student_id: string;
  student_name: string;
  topic: CounselorTalkTopic;
  content: string;
  follow_up?: string;
  talk_at: string;
  source_alert_id?: string;
  source_care_task_id?: string;
}

export function listCounselorTalks(
  params: CounselorTalkQueryParams,
): Promise<PageResult<CounselorTalk>> {
  return api.get('/counselor-talks', { params }).then((res) => res.data);
}

export function createCounselorTalk(data: CreateCounselorTalkData): Promise<CounselorTalk> {
  return api.post('/counselor-talks', data).then((res) => res.data);
}

export function getCounselorTalk(id: string): Promise<CounselorTalk> {
  return api.get(`/counselor-talks/${id}`).then((res) => res.data);
}
