import type { PageResult } from '@xg1/shared';
import api from './index';

// =====================================================================
// Position
// =====================================================================

export interface TimeSlot {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  start: string;   // HH:MM
  end: string;
}

export interface WorkStudyPosition {
  id: string;
  title: string;
  position_type: string | null;       // fixed / temporary
  department_name: string | null;     // legacy free-text
  description: string;
  requirements: string | null;
  prefer_financial_aid: boolean | null;
  hourly_rate: string | null;         // legacy
  weekly_hours: number | null;
  headcount: number | null;
  hired_count: number | null;
  status: string;                     // draft / pending_approval / open / closed
  start_date: string | null;
  end_date: string | null;
  creator_id: string;
  workflow_instance_id: string | null;

  // V051 expansion
  employer_id: string | null;
  academic_year: string | null;
  owner_user_id: string | null;
  owner_phone: string | null;
  campus: string | null;
  work_location: string | null;
  duration_months: number | null;
  time_slots: TimeSlot[] | string | null;
  application_deadline: string | null;
  salary_unit: 'hour' | 'day' | 'month' | 'per_task' | null;
  salary_amount: string | null;
  reason: string | null;
  gender_limit: 'male' | 'female' | null;
  aid_levels: string[] | string | null;
  grade_limits: string[] | string | null;
  college_limits: (string | number)[] | string | null;
  self_arranged: boolean | null;

  created_at: string;
  updated_at: string;
}

export interface PositionQueryParams {
  page: number;
  size: number;
  status?: string;
  position_type?: string;
  prefer_financial_aid?: boolean;
  academic_year?: string;
  employer_id?: string;
  studentScope?: boolean;
}

export interface CreatePositionData {
  title: string;
  position_type?: string;
  department_name?: string;
  description: string;
  requirements?: string;
  prefer_financial_aid?: boolean;
  hourly_rate?: string;
  weekly_hours?: number;
  headcount?: number;
  start_date?: string;
  end_date?: string;
  // V051
  employer_id?: string;
  academic_year?: string;
  owner_user_id?: string;
  owner_phone?: string;
  campus?: string;
  work_location?: string;
  duration_months?: number;
  time_slots?: TimeSlot[];
  application_deadline?: string;
  salary_unit?: 'hour' | 'day' | 'month' | 'per_task';
  salary_amount?: string;
  reason?: string;
  gender_limit?: 'male' | 'female';
  aid_levels?: string[];
  grade_limits?: string[];
  college_limits?: (string | number)[];
  self_arranged?: boolean;
}

// =====================================================================
// Application
// =====================================================================

export interface WorkStudyApplication {
  id: string;
  position_id: string;
  student_id: string;
  student_name: string;
  financial_aid_level: string | null;
  intro: string;
  status: string;       // pending / hired / rejected
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  workflow_instance_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationQueryParams {
  page: number;
  size: number;
  position_id?: string;
  student_id?: string;
  status?: string;
}

export interface ApplyData {
  position_id: string;
  financial_aid_level?: string;
  intro: string;
  extra_data?: Record<string, unknown>;
}

/** apply_v1 v2 is 1-step; status='hired' → approve, 'rejected' → reject. */
export interface DecisionData {
  status: 'hired' | 'rejected';
  decision_note?: string;
}

// =====================================================================
// Employer
// =====================================================================

export interface Employer {
  id: string;
  name: string;
  leader_user_id: string;
  operator_user_ids: string[] | string | null;
  contact_name: string | null;
  contact_phone: string | null;
  email: string | null;
  status: 'active' | 'disabled';
  allow_self_arrange: boolean;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployerQuery {
  page: number;
  size: number;
  keyword?: string;
  status?: 'active' | 'disabled';
  leader_user_id?: string;
}

export interface EmployerUpsert {
  name: string;
  leader_user_id: string;
  operator_user_ids?: string[];
  contact_name?: string;
  contact_phone?: string;
  email?: string;
  allow_self_arrange?: boolean;
  remark?: string;
}

// =====================================================================
// Year setting
// =====================================================================

export interface WorkStudyYearSetting {
  id: string;
  academic_year: string;
  max_fixed_per_student: number;
  max_temp_per_student: number;
  application_open: boolean;
  default_allow_self_arrange: boolean;
  created_at: string;
  updated_at: string;
}

export interface YearSettingUpsert {
  academic_year: string;
  max_fixed_per_student?: number;
  max_temp_per_student?: number;
  application_open?: boolean;
  default_allow_self_arrange?: boolean;
}

// =====================================================================
// Salary
// =====================================================================

export interface WorkStudySalary {
  id: string;
  timesheet_id: string | null;
  workflow_instance_id: string | null;
  student_id: string;
  position_id: string;
  position_type: string | null;
  month: string;
  units: string | null;
  unit_type: string | null;
  unit_rate: string | null;
  hours: string | null;
  hourly_rate: string | null;
  amount: string;
  status: 'draft' | 'pending' | 'confirmed' | 'rejected' | 'paid';
  reporter_id: string | null;
  report_note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryQuery {
  page: number;
  size: number;
  studentId?: string;
  positionId?: string;
  month?: string;
  status?: string;
  positionType?: string;
}

export interface SalarySubmit {
  application_id: string;
  month: string;
  units: string;
  report_note?: string;
}

export interface SalaryDecision {
  action: 'approve' | 'reject';
  note?: string;
}

// =====================================================================
// Position endpoints
// =====================================================================

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

export function decidePosition(id: string, action: 'approve' | 'reject', note?: string): Promise<void> {
  return api
    .put(`/work-study/positions/${id}/decide`, null, { params: { action, note } })
    .then(() => undefined);
}

// =====================================================================
// Application endpoints
// =====================================================================

export function listApplications(params: ApplicationQueryParams): Promise<PageResult<WorkStudyApplication>> {
  return api.get('/work-study/applications', { params }).then((res) => res.data);
}

export function getApplicationDetail(id: string): Promise<WorkStudyApplication> {
  return api.get(`/work-study/applications/${id}`).then((res) => res.data);
}

export function apply(data: ApplyData): Promise<WorkStudyApplication> {
  return api.post('/work-study/applications', data).then((res) => res.data);
}

export function decideApplication(id: string, data: DecisionData): Promise<void> {
  return api.put(`/work-study/applications/${id}/decide`, data).then(() => undefined);
}

// =====================================================================
// Employer endpoints
// =====================================================================

export function listEmployers(params: EmployerQuery): Promise<PageResult<Employer>> {
  return api.get('/work-study/employers', { params }).then((res) => res.data);
}

export function getEmployer(id: string): Promise<Employer> {
  return api.get(`/work-study/employers/${id}`).then((res) => res.data);
}

export function createEmployer(data: EmployerUpsert): Promise<Employer> {
  return api.post('/work-study/employers', data).then((res) => res.data);
}

export function updateEmployer(id: string, data: EmployerUpsert): Promise<Employer> {
  return api.put(`/work-study/employers/${id}`, data).then((res) => res.data);
}

export function setEmployerStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  return api
    .put(`/work-study/employers/${id}/status`, null, { params: { status } })
    .then(() => undefined);
}

// =====================================================================
// Year-setting endpoints
// =====================================================================

export function listYearSettings(): Promise<WorkStudyYearSetting[]> {
  return api.get('/work-study/year-settings').then((res) => res.data);
}

export function getYearSetting(year: string): Promise<WorkStudyYearSetting> {
  return api.get(`/work-study/year-settings/${year}`).then((res) => res.data);
}

export function upsertYearSetting(data: YearSettingUpsert): Promise<WorkStudyYearSetting> {
  return api.post('/work-study/year-settings', data).then((res) => res.data);
}

export function syncPositionsFromYear(toYear: string, fromYear: string): Promise<{ copied: number; fromYear: string; toYear: string }> {
  return api
    .post(`/work-study/year-settings/${toYear}/sync-positions`, null, { params: { fromYear } })
    .then((res) => res.data);
}

// =====================================================================
// Salary endpoints
// =====================================================================

export function listSalaries(params: SalaryQuery): Promise<PageResult<WorkStudySalary>> {
  return api.get('/work-study/salaries', { params }).then((res) => res.data);
}

export function getSalary(id: string): Promise<WorkStudySalary> {
  return api.get(`/work-study/salaries/${id}`).then((res) => res.data);
}

export function submitSalary(data: SalarySubmit): Promise<WorkStudySalary> {
  return api.post('/work-study/salaries', data).then((res) => res.data);
}

export function decideSalary(id: string, data: SalaryDecision): Promise<void> {
  return api.put(`/work-study/salaries/${id}/decide`, data).then(() => undefined);
}

// =====================================================================
// Student preference (个人课表 + 岗位偏好)
// =====================================================================

/** 5 段（钟点制）。p1=8-10 / p2=10-12 / p3=14-16 / p4=16-18 / p5=19-21 */
export type PeriodCode = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** 周一到周日，每天列出"有课"的节次。空数组 = 整天空闲。 */
export type CourseSchedule = Partial<Record<DayCode, PeriodCode[]>>;

export interface PositionPref {
  types?: ('fixed' | 'temporary')[];
  campus?: string;
  rate_min?: number;
  rate_max?: number;
  keywords?: string;
}

/**
 * 服务端按 raw JSON 字符串透传 course_schedule / position_pref，前端在用之前
 * 解析一次。学生从未保存过时 course_schedule = "{}"，position_pref = "{}"。
 */
export interface StudentWorkStudyPreference {
  id: string | null;
  student_id: string;
  course_schedule: string;
  position_pref: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface PreferenceUpsert {
  course_schedule: string;  // JSON.stringify(CourseSchedule)
  position_pref: string;    // JSON.stringify(PositionPref)
}

export function getMyPreference(): Promise<StudentWorkStudyPreference> {
  return api.get('/work-study/me/preference').then((res) => res.data);
}

export function upsertMyPreference(data: PreferenceUpsert): Promise<StudentWorkStudyPreference> {
  return api.put('/work-study/me/preference', data).then((res) => res.data);
}
