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

  // A1 — false 表示暂停招新（status 仍可能是 open）
  accepting_applications: boolean | null;
  paused_reason: string | null;

  // B3 困难生策略
  financial_aid_policy: 'none' | 'bonus' | 'reserved' | 'only' | null;
  reserved_count: number | null;

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
  description: string;
  requirements?: string;
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
  // B3
  financial_aid_policy?: 'none' | 'bonus' | 'reserved' | 'only';
  reserved_count?: number;
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
  // A2 在岗生命周期（hired 之后才会有值）
  engagement_status: 'on_duty' | 'offboarded' | null;
  engaged_at: string | null;
  offboarded_at: string | null;
  offboard_reason: 'completed' | 'terminated_by_employer' | 'resigned_by_student' | null;
  offboard_note: string | null;
  offboard_operator_id: string | null;
  // B2 面试通知（status=pending 时可发）
  interview_at: string | null;
  interview_location: string | null;
  interview_notes: string | null;
  interview_notified_at: string | null;
  created_at: string;
  updated_at: string;
  // 后端在 include=position 时附带的岗位摘要
  position_summary?: PositionSummary | null;
}

export interface PositionSummary {
  id: string;
  title: string;
  position_type: 'fixed' | 'temporary' | null;
  department_name: string | null;
  salary_unit: string | null;
  salary_amount: string | number | null;
}

export interface ApplicationQueryParams {
  page: number;
  size: number;
  position_id?: string;
  student_id?: string;
  status?: string;
  /** Backend DTO field is camelCase (engagementStatus) — Spring data binding
   * doesn't snake-case-to-camelCase for query params, so we must send the
   * camel name on the wire even though response objects use snake_case. */
  engagementStatus?: 'on_duty' | 'offboarded';
  /** 让后端 join 一段岗位摘要进来：`include=position`。 */
  include?: string;
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
  /** 月薪酬发放上限(元字符串,精度 2 位);null=不限 */
  monthly_salary_cap: string | null;
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
  monthly_salary_cap?: number | string | null;
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
  // 三阶段时间窗(V114),null = 该阶段不限时段
  position_window_start: string | null;
  position_window_end: string | null;
  application_window_start: string | null;
  application_window_end: string | null;
  salary_window_start: string | null;
  salary_window_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface YearSettingUpsert {
  academic_year: string;
  max_fixed_per_student?: number;
  max_temp_per_student?: number;
  application_open?: boolean;
  default_allow_self_arrange?: boolean;
  position_window_start?: string | null;
  position_window_end?: string | null;
  application_window_start?: string | null;
  application_window_end?: string | null;
  salary_window_start?: string | null;
  salary_window_end?: string | null;
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
  // include=position 时附带
  position_summary?: PositionSummary | null;
}

export interface SalaryQuery {
  page: number;
  size: number;
  studentId?: string;
  positionId?: string;
  month?: string;
  status?: string;
  positionType?: string;
  include?: string;
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

/** A1 暂停 / 恢复招新。reason 仅在暂停时（accepting=false）有意义。 */
export function setPositionAcceptingApplications(
  id: string,
  accepting: boolean,
  reason?: string,
): Promise<void> {
  return api
    .put(`/work-study/positions/${id}/accepting-applications`, null, {
      params: { accepting, reason },
    })
    .then(() => undefined);
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

// --- Offboarding (A2) ---

export interface OffboardByEmployerPayload {
  /** completed = 任期到期；terminated_by_employer = 单位主动终止（默认） */
  reason?: 'completed' | 'terminated_by_employer';
  note?: string;
}

export interface OffboardByStudentPayload {
  note?: string;
}

export function offboardByEmployer(id: string, data: OffboardByEmployerPayload): Promise<void> {
  return api.post(`/work-study/applications/${id}/offboard-by-employer`, data).then(() => undefined);
}

export function offboardByStudent(id: string, data: OffboardByStudentPayload): Promise<void> {
  return api.post(`/work-study/applications/${id}/offboard-by-student`, data).then(() => undefined);
}

// --- Interview notice (B2) ---

export interface ScheduleInterviewPayload {
  /** ISO datetime — JavaScript Date#toISOString() / Dayjs#toISOString() */
  interview_at: string;
  interview_location: string;
  /** Employer 端内部备注（不发给学生） */
  interview_notes?: string;
  /** 发给学生的通知正文（AI 起草 + 用户编辑后） */
  body: string;
}

export function scheduleInterview(id: string, data: ScheduleInterviewPayload): Promise<void> {
  return api.post(`/work-study/applications/${id}/schedule-interview`, data).then(() => undefined);
}

export interface DraftInterviewNoticeReq {
  student_name: string;
  position_title: string;
  department_name?: string;
  /** 已格式化的可读时间，如 "2026-05-20 14:00" */
  interview_at: string;
  interview_location: string;
  employer_note?: string;
}

export interface DraftInterviewNoticeResp {
  draft: string;
  model: string;
  error_message: string | null;
}

/** AI 起草面试通知文案 — 直连 sidecar，失败时返回 error_message 不阻塞。 */
export async function draftInterviewNotice(
  payload: DraftInterviewNoticeReq,
): Promise<DraftInterviewNoticeResp> {
  const res = await fetch('/ai/api/v1/workstudy/draft-interview-notice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- P2.1 自荐说明 AI 起草 ---

export interface DraftApplyIntroReq {
  student_name: string;
  grade?: string;
  college?: string;
  major?: string;
  financial_aid_level?: string;
  position_title: string;
  department_name?: string;
  position_type?: string;
  position_description?: string;
  keywords?: string;
}

export interface DraftApplyIntroResp {
  draft: string;
  model: string;
  error_message: string | null;
}

export async function draftApplyIntro(payload: DraftApplyIntroReq): Promise<DraftApplyIntroResp> {
  const res = await fetch('/ai/api/v1/workstudy/draft-apply-intro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Batch actions (A3) ---

export interface BatchOffboardPayload {
  application_ids: string[];
  reason?: 'completed' | 'terminated_by_employer';
  note?: string;
}

export interface BatchNotifyPayload {
  application_ids: string[];
  title: string;
  body: string;
}

export interface BatchActionResult {
  succeeded: number;
  skipped: number;
  failures: Array<{ application_id: string; code: string; message: string }>;
}

export function batchOffboardApplications(data: BatchOffboardPayload): Promise<BatchActionResult> {
  return api.post('/work-study/applications/batch/offboard', data).then((res) => res.data);
}

export function batchNotifyApplications(data: BatchNotifyPayload): Promise<BatchActionResult> {
  return api.post('/work-study/applications/batch/notify', data).then((res) => res.data);
}

// --- B3 学生侧推荐 ---

export interface PositionRecommendation {
  position_id: string;
  title: string;
  department_name: string | null;
  campus: string | null;
  work_location: string | null;
  salary_unit: 'hour' | 'day' | 'month' | 'per_task' | null;
  salary_amount: string | null;
  weekly_hours: number | null;
  headcount: number | null;
  hired_count: number | null;
  financial_aid_policy: 'none' | 'bonus' | 'reserved' | 'only' | null;
  reserved_count: number | null;
  score: number;
  /** AI 写的友好理由；sidecar 失败时为空 */
  reason: string;
  scoring_signals: Record<string, unknown>;
}

export function getMyRecommendedPositions(topK = 5): Promise<PositionRecommendation[]> {
  return api
    .get('/work-study/me/recommended-positions', { params: { topK } })
    .then((res) => res.data);
}

// --- A4 导出 + AI 报表 ---

export interface WorkStudyReportDsl {
  title: string;
  summary: string;
  entity: 'application';
  filters: Record<string, unknown>;
  columns: string[];
}

export interface NlToReportResp extends WorkStudyReportDsl {
  model: string;
  error_message: string | null;
}

/** P0 仅 application 实体的可选列；与 Java COLUMN_REGISTRY 保持一致。 */
export const WORKSTUDY_REPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'id', label: '申请ID' },
  { key: 'student_name', label: '学生姓名' },
  { key: 'student_id', label: '学生ID' },
  { key: 'position_id', label: '岗位ID' },
  { key: 'position_title', label: '岗位' },
  { key: 'financial_aid_level', label: '资助等级' },
  { key: 'intro', label: '自荐' },
  { key: 'status', label: '状态' },
  { key: 'decision_note', label: '处理意见' },
  { key: 'decided_at', label: '处理时间' },
  { key: 'engagement_status', label: '在岗状态' },
  { key: 'engaged_at', label: '到岗时间' },
  { key: 'offboarded_at', label: '离岗时间' },
  { key: 'offboard_reason', label: '离岗原因' },
  { key: 'offboard_note', label: '离岗备注' },
  { key: 'created_at', label: '提交时间' },
];

/** AI 把 NL 翻译成 DSL（直连 sidecar；失败时 error_message 兜底）。 */
export async function nlToWorkstudyReport(payload: {
  query: string;
  today?: string;
  academic_year?: string;
  allowed_columns?: string[];
}): Promise<NlToReportResp> {
  const res = await fetch('/ai/api/v1/workstudy/nl-to-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 把 Java 后端返回的 xlsx blob 触发浏览器下载。 */
function triggerXlsxDownload(blob: Blob, fallbackName: string, contentDisposition?: string | null) {
  let filename = `${fallbackName}.xlsx`;
  if (contentDisposition) {
    const m = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
    if (m) try { filename = decodeURIComponent(m[1]); } catch { /* keep fallback */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportApplicationsCurrentView(query: ApplicationQueryParams): Promise<void> {
  const res = await api.get('/work-study/export/applications', {
    params: query,
    responseType: 'blob',
  });
  triggerXlsxDownload(res.data, 'workstudy_applications', res.headers?.['content-disposition']);
}

export async function exportWorkstudyByDsl(dsl: WorkStudyReportDsl): Promise<void> {
  const res = await api.post('/work-study/export/nl-report', dsl, { responseType: 'blob' });
  triggerXlsxDownload(res.data, 'workstudy_report', res.headers?.['content-disposition']);
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

export interface EmployerStaffItem {
  user_id: string;
  name: string;
  role: 'leader' | 'operator';
}

/** 列出某单位「可被指定为岗位负责人」的成员（leader + operators）。发布岗位表单下拉用。 */
export function listEmployerStaff(employerId: string): Promise<EmployerStaffItem[]> {
  return api.get(`/work-study/employers/${employerId}/staff`).then((res) => res.data);
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
