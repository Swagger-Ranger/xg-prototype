import type { PageResult } from '@xg1/shared';
import api from './index';

export interface Complaint {
  id: string;
  title: string;
  category: string;
  content: string;
  anonymous: boolean;
  status: 'pending' | 'processing' | 'replied' | 'closed';
  reply_content: string | null;
  reply_at: string | null;
  satisfaction: number | null;
  student_id: string;
  student_name: string;
  handler_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintQueryParams {
  page: number;
  size: number;
  status?: string;
  category?: string;
}

export interface SubmitComplaintData {
  title: string;
  category: string;
  content: string;
  anonymous: boolean;
}

export interface ReplyComplaintData {
  reply_content: string;
}

export function getMyComplaints(params: ComplaintQueryParams): Promise<PageResult<Complaint>> {
  return api.get('/complaints/my', { params }).then((res) => res.data);
}

export function getAllComplaints(params: ComplaintQueryParams): Promise<PageResult<Complaint>> {
  return api.get('/complaints', { params }).then((res) => res.data);
}

export function submitComplaint(data: SubmitComplaintData): Promise<Complaint> {
  return api.post('/complaints', data).then((res) => res.data);
}

export function replyComplaint(id: string, data: ReplyComplaintData): Promise<void> {
  return api.put(`/complaints/${id}/reply`, data).then(() => undefined);
}

export function submitFeedback(id: string, satisfaction: number): Promise<void> {
  return api.put(`/complaints/${id}/feedback`, { satisfaction }).then(() => undefined);
}
