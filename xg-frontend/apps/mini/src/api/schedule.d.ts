/**
 * Schedule (课表) API client.
 *
 * P2 仅 mock —— 后端真实端点待定（预计 GET /students/{id}/schedule?week=N）。
 * 等接口可用后只替换 fetchSchedule 实现，调用方无感。
 */
export interface ScheduleClass {
    id: string;
    course_name: string;
    teacher: string;
    location: string;
    /** 1=周一, 7=周日 */
    day_of_week: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    /** "HH:mm" */
    start_time: string;
    end_time: string;
    /** 1-2 / 3-4 / 5-6 / 7-8 / 9-10 / 11 等节次范围，仅展示用 */
    periods: string;
    /** UI 角标颜色 token，避免每个学期都重新算颜色：'blue'|'peach'|'cream'|'warn'|'ok' */
    tone: 'blue' | 'peach' | 'cream' | 'warn' | 'ok';
}
export interface WeekSchedule {
    /** 学期周序号，e.g. 8 */
    week_index: number;
    /** 学期总周数，用于 selector 上限 */
    total_weeks: number;
    classes: ScheduleClass[];
}
/**
 * 获取课表。当前返回 mock；待真实接口落地后只改这里。
 *
 * @param _week 默认 当前周。后端用 week index 取数。
 */
export declare function fetchSchedule(_week?: number): Promise<WeekSchedule>;
//# sourceMappingURL=schedule.d.ts.map