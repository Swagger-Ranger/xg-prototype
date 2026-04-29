import { get, post, postAi } from '../utils/request';

export interface MiniPage<T> {
  data: T[];
  total: number | string;
}

export interface MiniPosition {
  id: string;
  title: string;
  position_type: string | null;
  department_name: string | null;
  campus: string | null;
  work_location: string | null;
  description: string;
  requirements: string | null;
  hourly_rate: string | null;
  salary_unit: string | null;
  salary_amount: string | null;
  weekly_hours: number | null;
  headcount: number | null;
  hired_count: number | null;
  status: string;
  application_deadline: string | null;
  academic_year: string | null;
}

export interface PositionSummary {
  id: string;
  title: string;
  position_type: string | null;
  department_name: string | null;
  salary_unit: string | null;
  salary_amount: string | null;
}

export interface MiniApplication {
  id: string;
  position_id: string;
  student_id: string;
  intro: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  /** Present when the list call asked for include=position. */
  position_summary?: PositionSummary | null;
}

export function listOpenPositions(page = 1, size = 20) {
  return get<MiniPage<MiniPosition>>('/work-study/positions', {
    page,
    size,
    status: 'open',
    studentScope: true,
  });
}

export function getPosition(id: string) {
  return get<MiniPosition>(`/work-study/positions/${id}`);
}

export function applyToPosition(positionId: string, intro: string, financialAidLevel?: string) {
  return post<MiniApplication>('/work-study/applications', {
    position_id: positionId,
    intro,
    financial_aid_level: financialAidLevel,
  });
}

export function listMyApplications(studentId: string, page = 1, size = 20) {
  return get<MiniPage<MiniApplication>>('/work-study/applications', {
    page,
    size,
    student_id: studentId,
    include: 'position',
  });
}

export interface MiniSalary {
  id: string;
  position_id: string;
  position_type: string | null;
  month: string;
  units: string | null;
  unit_type: string | null;
  unit_rate: string | null;
  hours: string | null;
  hourly_rate: string | null;
  amount: string;
  status: string;     // draft / pending / confirmed / rejected / paid
  reporter_id: string | null;
  report_note: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
  /** Present when the list call asked for include=position. */
  position_summary?: PositionSummary | null;
}

export function listMySalaries(studentId: string, page = 1, size = 50) {
  return get<MiniPage<MiniSalary>>('/work-study/salaries', {
    page,
    size,
    studentId,
    include: 'position',
  });
}

/** Direct call into AI sidecar (no LLM router) — returns the formatted draft. */
export function draftApplicationIntro(positionId: string, studentBrief?: string): Promise<string> {
  return postAi<{ output: string; tool: string }>(
    '/tools/draft_workstudy_application_intro/execute',
    { args: { position_id: Number(positionId), student_brief: studentBrief } },
  ).then((res) => res.output);
}

/** Day code expected by the AI sidecar's match tool. */
export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** Free time slot — one entry per (day, time-band) the student is free. */
export interface FreeSlot {
  day: DayCode;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
}

export interface PositionPref {
  keyword?: string;
  /** Omit for both fixed and temporary. */
  position_type?: 'fixed' | 'temporary';
  /** Minimum salary per time-unit, e.g. 18. */
  min_rate?: number;
  campus?: string;
}

export function findByPreference(pref: PositionPref): Promise<string> {
  return postAi<{ output: string; tool: string }>(
    '/tools/find_workstudy_positions_by_preference/execute',
    { args: pref },
  ).then((res) => res.output);
}

export function matchToSchedule(slots: FreeSlot[]): Promise<string> {
  return postAi<{ output: string; tool: string }>(
    '/tools/match_workstudy_positions_to_schedule/execute',
    { args: { free_slots: slots } },
  ).then((res) => res.output);
}
