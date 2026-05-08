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
export declare function listOpenPositions(page?: number, size?: number): Promise<MiniPage<MiniPosition>>;
export declare function getPosition(id: string): Promise<MiniPosition>;
export declare function applyToPosition(positionId: string, intro: string, financialAidLevel?: string): Promise<MiniApplication>;
export declare function listMyApplications(studentId: string, page?: number, size?: number): Promise<MiniPage<MiniApplication>>;
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
    status: string;
    reporter_id: string | null;
    report_note: string | null;
    confirmed_at: string | null;
    paid_at: string | null;
    created_at: string;
    /** Present when the list call asked for include=position. */
    position_summary?: PositionSummary | null;
}
export declare function listMySalaries(studentId: string, page?: number, size?: number): Promise<MiniPage<MiniSalary>>;
/** Direct call into AI sidecar (no LLM router) — returns the formatted draft. */
export declare function draftApplicationIntro(positionId: string, studentBrief?: string): Promise<string>;
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
export declare function findByPreference(pref: PositionPref): Promise<string>;
export declare function matchToSchedule(slots: FreeSlot[]): Promise<string>;
//# sourceMappingURL=workStudy.d.ts.map