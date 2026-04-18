import type { PageResult } from '@xg1/shared';
import api from './index';

export interface CollectionForm {
  id: string;
  title: string;
  description: string;
  fields: CollectionField[];
  creator_id: string;
  scope_type: string;
  status: 'draft' | 'published' | 'closed';
  deadline: string;
  allow_edit: boolean;
  source_form_id: string | null;
  created_at: string;
}

export interface CollectionField {
  label: string;
  type: 'text' | 'select' | 'date' | 'file';
  required: boolean;
  options?: string[];
}

export interface CollectionSubmission {
  id: string;
  form_id: string;
  student_id: string;
  data: Record<string, unknown>;
  status: string;
  submitted_at: string;
}

export interface CreateFormData {
  title: string;
  description?: string;
  fields: CollectionField[];
  scope_type?: string;
  deadline?: string;
  allow_edit?: boolean;
}

export interface CopyFormData {
  title: string;
  deadline?: string;
  scope_org_ids?: string[];
}

export interface FormProgress {
  total: number;
  submitted: number;
  submissions: CollectionSubmission[];
}

export interface GetMyFormsParams {
  page: number;
  size: number;
  status?: string;
}

export function getMyForms(params: GetMyFormsParams): Promise<PageResult<CollectionForm>> {
  return api.get('/collections/forms', { params }).then((res) => res.data);
}

export function createForm(data: CreateFormData): Promise<CollectionForm> {
  return api.post('/collections/forms', data).then((res) => res.data);
}

export function copyForm(id: string, data: CopyFormData): Promise<CollectionForm> {
  return api.post(`/collections/forms/${id}/copy`, data).then((res) => res.data);
}

export function publishForm(id: string): Promise<void> {
  return api.post(`/collections/forms/${id}/publish`).then(() => undefined);
}

export function closeForm(id: string): Promise<void> {
  return api.post(`/collections/forms/${id}/close`).then(() => undefined);
}

export function getFormProgress(id: string): Promise<FormProgress> {
  return api.get(`/collections/forms/${id}/progress`).then((res) => res.data);
}

export function remindForm(id: string): Promise<void> {
  return api.post(`/collections/forms/${id}/remind`).then(() => undefined);
}
