import type { PageResult } from '@xg1/shared';
import api from './index';

export interface ViolationRecord {
  id: string;
  student_id: string;
  student_name: string;
  category: string;
  occurred_at: string;
  location: string | null;
  description: string;
  recorder_id: string;
  recorder_name: string;
  punishment_id: string | null;
  approval_status: string;
  approver_id: string | null;
  approver_name: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Punishment {
  id: string;
  violation_record_id: string | null;
  student_id: string;
  student_name: string;
  level: string;
  reason: string;
  effective_date: string;
  expiry_date: string | null;
  status: string;
  issuer_id: string;
  issuer_name: string;
  created_at: string;
  updated_at: string;
}

export interface ViolationAppeal {
  id: string;
  violation_record_id: string;
  student_id: string;
  student_name: string;
  reason: string;
  status: string;
  resolver_id: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ViolationQueryParams {
  page: number;
  size: number;
  student_id?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  approval_status?: string;
  recorder_id?: string;
}

export interface PunishmentQueryParams {
  page: number;
  size: number;
  student_id?: string;
  level?: string;
  status?: string;
}

export interface AppealQueryParams {
  page: number;
  size: number;
  student_id?: string;
  status?: string;
}

export interface CreateViolationData {
  student_id: string;
  student_name: string;
  category: string;
  occurred_at: string;
  location?: string;
  description: string;
}

export interface CreatePunishmentData {
  violation_record_id?: string;
  student_id: string;
  student_name: string;
  level: string;
  reason: string;
  effective_date: string;
  expiry_date?: string;
}

export interface CreateAppealData {
  violation_record_id: string;
  reason: string;
}

export interface ResolveAppealData {
  outcome: 'upheld' | 'rejected';
  note?: string;
}

export function listViolations(params: ViolationQueryParams): Promise<PageResult<ViolationRecord>> {
  return api.get('/violations', { params }).then((res) => res.data);
}

export function getViolation(id: string): Promise<ViolationRecord> {
  return api.get(`/violations/${id}`).then((res) => res.data);
}

export function recordViolation(data: CreateViolationData): Promise<ViolationRecord> {
  return api.post('/violations', data).then((res) => res.data);
}

export function submitViolation(id: string): Promise<ViolationRecord> {
  return api.post(`/violations/${id}/submit`).then((res) => res.data);
}

export function approveViolation(id: string): Promise<ViolationRecord> {
  return api.post(`/violations/${id}/approve`).then((res) => res.data);
}

export function rejectViolation(id: string, reason: string): Promise<ViolationRecord> {
  return api.post(`/violations/${id}/reject`, { reason }).then((res) => res.data);
}

export function listPunishments(params: PunishmentQueryParams): Promise<PageResult<Punishment>> {
  return api.get('/punishments', { params }).then((res) => res.data);
}

export function getPunishment(id: string): Promise<Punishment> {
  return api.get(`/punishments/${id}`).then((res) => res.data);
}

export function issuePunishment(data: CreatePunishmentData): Promise<Punishment> {
  return api.post('/punishments', data).then((res) => res.data);
}

export function listAppeals(params: AppealQueryParams): Promise<PageResult<ViolationAppeal>> {
  return api.get('/violations/appeals', { params }).then((res) => res.data);
}

export function submitAppeal(data: CreateAppealData): Promise<ViolationAppeal> {
  return api.post('/violations/appeals', data).then((res) => res.data);
}

export function resolveAppeal(id: string, data: ResolveAppealData): Promise<ViolationAppeal> {
  return api.post(`/violations/appeals/${id}/resolve`, data).then((res) => res.data);
}
