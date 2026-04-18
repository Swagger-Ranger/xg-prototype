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

export interface ViolationQueryParams {
  page: number;
  size: number;
  student_id?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
}

export interface PunishmentQueryParams {
  page: number;
  size: number;
  student_id?: string;
  level?: string;
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

export function listViolations(params: ViolationQueryParams): Promise<PageResult<ViolationRecord>> {
  return api.get('/violations', { params }).then((res) => res.data);
}

export function getViolation(id: string): Promise<ViolationRecord> {
  return api.get(`/violations/${id}`).then((res) => res.data);
}

export function recordViolation(data: CreateViolationData): Promise<ViolationRecord> {
  return api.post('/violations', data).then((res) => res.data);
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
