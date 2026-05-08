import api from './index';

/* ── Types ──────────────────────────────────────────────────────── */

export interface AcademicTerm {
  id: string;
  tenant_id: string;
  code: string;                 // "2025-2026-2"
  name: string;
  start_date: string;           // ISO date "2026-02-23"
  end_date: string;
  total_weeks: number;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicTermUpsert {
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  is_current?: boolean;
}

/**
 * Enriched view returned by /terms/current — adds derived fields the campus
 * dashboard needs. effective_total_weeks / current_week / phase are computed
 * from {@link AcademicEvent} rows linked by term_code (期末考试 marks the
 * teaching cap; 假期 days get subtracted from the week count).
 */
export interface CurrentTermView {
  id: string;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  total_weeks_configured: number;
  effective_total_weeks: number;
  current_week: number;
  /** pre_term / teaching / exam / holiday / post_term */
  phase: string;
  next_exam: AcademicEvent | null;
  days_to_exam: number | null;
  next_holiday: AcademicEvent | null;
  days_to_next_holiday: number | null;
  days_to_term_end: number;
}

export type AcademicEventType = 'exam_midterm' | 'exam_final' | 'holiday' | 'other';
export type AcademicEventGranularity = 'day' | 'month';

export interface AcademicEvent {
  id: string;
  tenant_id: string;
  term_code: string | null;
  event_type: AcademicEventType | string;
  name: string;
  start_date: string;
  end_date: string;
  granularity: AcademicEventGranularity;
  notes: string | null;
}

export interface AcademicEventUpsert {
  term_code?: string | null;
  event_type: string;
  name: string;
  start_date: string;
  end_date: string;
  granularity: AcademicEventGranularity;
  notes?: string | null;
}

/** A single course row inside ClassSchedule.entries. */
export interface ClassScheduleEntry {
  course_name: string;
  teacher: string;
  location: string;
  day_of_week: number;            // 1=Mon ... 7=Sun
  start_period: number;
  end_period: number;
  weeks: number[];
  color?: string;
}

export interface ClassSchedule {
  id: string;
  tenant_id: string;
  class_id: string;
  term_code: string;
  source: string | null;
  last_synced_at: string | null;
  imported_by: string | null;
  /** Backend serialises JSONB via @JsonRawValue, so this is the raw array. */
  entries: ClassScheduleEntry[];
  created_at: string;
  updated_at: string;
}

export interface ClassScheduleUpsert {
  class_id: number | string;
  term_code: string;
  source?: string;
  /** Backend expects this as a raw JSON string (typeHandler stores it as JSONB). */
  entries: string;
}

/* ── Terms ─────────────────────────────────────────────────────── */

export function listTerms(): Promise<AcademicTerm[]> {
  return api.get('/academic/terms').then((res) => res.data);
}

export function getCurrentTerm(): Promise<CurrentTermView | null> {
  return api.get('/academic/terms/current').then((res) => res.data ?? null);
}

export function createTerm(data: AcademicTermUpsert): Promise<AcademicTerm> {
  return api.post('/academic/terms', data).then((res) => res.data);
}

export function updateTerm(id: string, data: AcademicTermUpsert): Promise<AcademicTerm> {
  return api.put(`/academic/terms/${id}`, data).then((res) => res.data);
}

export function setCurrentTerm(id: string): Promise<void> {
  return api.post(`/academic/terms/${id}/set-current`).then(() => undefined);
}

export function deleteTerm(id: string): Promise<void> {
  return api.delete(`/academic/terms/${id}`).then(() => undefined);
}

/* ── Events ────────────────────────────────────────────────────── */

export interface ListEventsParams {
  termCode?: string;
  upcomingOnly?: boolean;
}

export function listEvents(params?: ListEventsParams): Promise<AcademicEvent[]> {
  return api.get('/academic/events', { params }).then((res) => res.data);
}

export function createEvent(data: AcademicEventUpsert): Promise<AcademicEvent> {
  return api.post('/academic/events', data).then((res) => res.data);
}

export function updateEvent(id: string, data: AcademicEventUpsert): Promise<AcademicEvent> {
  return api.put(`/academic/events/${id}`, data).then((res) => res.data);
}

export function deleteEvent(id: string): Promise<void> {
  return api.delete(`/academic/events/${id}`).then(() => undefined);
}

/* ── Class schedules ───────────────────────────────────────────── */

export interface ListSchedulesParams {
  classId?: number | string;
  termCode?: string;
}

export function listSchedules(params?: ListSchedulesParams): Promise<ClassSchedule[]> {
  return api.get('/academic/class-schedules', { params }).then((res) => res.data);
}

export function getMySchedule(termCode: string): Promise<ClassSchedule | null> {
  return api
    .get('/academic/class-schedules/me', { params: { termCode } })
    .then((res) => res.data ?? null);
}

export function upsertSchedule(data: ClassScheduleUpsert): Promise<ClassSchedule> {
  return api.post('/academic/class-schedules', data).then((res) => res.data);
}

export function deleteSchedule(id: string): Promise<void> {
  return api.delete(`/academic/class-schedules/${id}`).then(() => undefined);
}

/** Admin-only: trigger the daily sync immediately. Returns total schedules touched. */
export function triggerScheduleSync(): Promise<number> {
  return api.post('/admin/class-schedules/sync').then((res) => res.data ?? 0);
}

/* ── Class picker (used by the schedule editor) ────────────────── */

export interface ClassRow {
  id: string;
  name: string;
  parent_name: string | null;
}

export function listClasses(): Promise<ClassRow[]> {
  return api.get('/academic/classes').then((res) => res.data);
}
