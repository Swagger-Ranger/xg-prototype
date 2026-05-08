export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'cancel_pending' | 'pending_manual_return';
export interface LeaveExtraField {
    field_key: string;
    field_label: string;
    field_type: 'text' | 'select' | 'date' | 'file' | 'number' | 'boolean';
    field_widget?: string | null;
    required?: boolean;
    options?: string[];
    placeholder?: string | null;
    min_length?: number | null;
    max_length?: number | null;
    pattern?: string | null;
    visible_when?: string;
}
export interface LeaveTypeConfig {
    id: string;
    code: string;
    name: string;
    parent_code: string | null;
    extra_fields: LeaveExtraField[] | null;
    require_attachment: boolean;
    enabled: boolean;
}
export interface FileRef {
    file_id: string;
    file_name: string;
    file_url: string;
    file_size: number;
}
export interface LeaveRequest {
    id: string;
    student_id: string;
    student_name: string;
    leave_type_code: string;
    leave_type_name: string;
    start_time: string;
    end_time: string;
    duration_days: number;
    reason: string;
    form_data: Record<string, unknown>;
    attachments: FileRef[];
    status: LeaveStatus;
    workflow_instance_id: string | null;
    apply_latitude?: number | null;
    apply_longitude?: number | null;
    apply_location_at?: string | null;
    return_latitude?: number | null;
    return_longitude?: number | null;
    return_location_at?: string | null;
    return_source?: string | null;
    manual_return_reason?: string | null;
    manual_return_attachments?: FileRef[] | null;
    manual_return_submitted_at?: string | null;
    created_at: string;
    updated_at: string;
}
export interface MiniPage<T> {
    data: T[];
    total: number | string;
}
export interface LeaveQueryParams {
    page: number;
    size: number;
    status?: string;
    leave_type_code?: string;
}
export declare const LEAVE_STATUS_LABELS: Record<LeaveStatus, string>;
/** Tag tone — drives status pill background & text color in list/detail. */
export type StatusTone = 'pending' | 'ok' | 'danger' | 'muted' | 'warn';
export declare const LEAVE_STATUS_TONES: Record<LeaveStatus, StatusTone>;
export declare function getLeaveTypes(): Promise<LeaveTypeConfig[]>;
export declare function listMyLeaves(params: LeaveQueryParams): Promise<MiniPage<LeaveRequest>>;
/**
 * 班级请假总览（辅导员视角）。后端按 counselor 当前班级范围过滤；
 * 可选 status / leave_type_code / 日期 范围进一步收窄。
 */
export declare function listClassLeaves(params: LeaveQueryParams): Promise<MiniPage<LeaveRequest>>;
/**
 * 未销假总览：已批准但学生未提交销假，或已过结束时间还没销。辅导员处理
 * "学生忘记销假"的入口。
 */
export declare function listUncancelledLeaves(params: LeaveQueryParams): Promise<MiniPage<LeaveRequest>>;
export declare function getLeaveDetail(id: string): Promise<LeaveRequest>;
export interface LeaveApplyData {
    leave_type_code: string;
    start_time: string;
    end_time: string;
    reason: string;
    extra_data?: Record<string, unknown>;
    apply_latitude?: number;
    apply_longitude?: number;
    apply_location_at?: string;
}
export declare function applyLeave(data: LeaveApplyData): Promise<LeaveRequest>;
export declare function withdrawLeave(id: string): Promise<void>;
export declare function cancelLeave(id: string): Promise<void>;
/** 辅导员侧确认学生提交的销假申请（status: cancel_pending → cancelled）。 */
export declare function confirmCancelLeave(id: string): Promise<void>;
/** 辅导员强制销假（学生未提交销假或异常情况），不可撤销。 */
export declare function forceCancelLeave(id: string): Promise<void>;
export interface ReturnByLocationResult {
    inFence: boolean;
    /** 学生当前位置距校园围栏中心的距离(米),保留一位小数 */
    distanceMeters: number;
    /** 围栏半径(米),前端展示「距离 X 米 / 半径 Y 米」用 */
    radiusMeters: number;
    centerLat: number;
    centerLng: number;
    /** 命中时返回更新后的 leave;不命中也返回 leave(只更新了 return_lat/lng) */
    leave: LeaveRequest;
}
export declare function returnByLocation(id: string, latitude: number, longitude: number, capturedAt: string): Promise<ReturnByLocationResult>;
export declare function applyManualReturn(id: string, reason: string, attachments: FileRef[]): Promise<LeaveRequest>;
export interface LeaveImpactCourseSlot {
    course_name: string;
    teacher: string | null;
    location: string | null;
    start_period: number;
    end_period: number;
    color: string | null;
}
export interface LeaveImpactDay {
    date: string;
    day_of_week: number;
    week: number;
    courses: LeaveImpactCourseSlot[];
}
export interface LeaveImpactView {
    total_periods: number;
    total_courses: number;
    total_days: number;
    term_code: string | null;
    by_day: LeaveImpactDay[];
}
export declare function getLeaveImpact(id: string): Promise<LeaveImpactView>;
/** 学生填表时实时预览会缺的课程。后端按 X-User-Id 取 student_id;
 *  非学生身份会返回 zero 视图,前端按 total_periods 判空态隐藏。 */
export declare function previewLeaveImpact(start: string, end: string): Promise<LeaveImpactView>;
/**
 * Mirror backend LeaveService.calculateDurationDays:
 *   ceil(seconds / 86400) — any partial day counts as a full day so that the
 *   workflow's duration_check sees the same number we display.
 *
 * `start` / `end` are ms-since-epoch.
 */
export declare function calculateDurationDays(start: number, end: number): number;
//# sourceMappingURL=leave.d.ts.map