/**
 * Leave API client (student-facing).
 *
 * Mirrors apps/web/src/api/leave.ts, scoped to what the mini-program needs:
 *  · 学生：列表 / 详情 / 提交 / 撤回 / 销假
 *  · 假别字典 + 假别动态字段（extra_fields）
 *
 * 辅导员审批走 workflow 端点，单独建文件。
 */
import { get, post } from '../utils/request';

export type LeaveStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'cancel_pending'
  | 'pending_manual_return';

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

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  draft: '草稿',
  pending: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已撤销',
  cancel_pending: '销假审批中',
  pending_manual_return: '人工销假待审',
};

/** Tag tone — drives status pill background & text color in list/detail. */
export type StatusTone = 'pending' | 'ok' | 'danger' | 'muted' | 'warn';

export const LEAVE_STATUS_TONES: Record<LeaveStatus, StatusTone> = {
  draft: 'muted',
  pending: 'pending',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
  cancel_pending: 'warn',
  pending_manual_return: 'warn',
};

export function getLeaveTypes() {
  return get<LeaveTypeConfig[]>('/leave-types');
}

export function listMyLeaves(params: LeaveQueryParams) {
  return get<MiniPage<LeaveRequest>>('/leaves/my', params as unknown as Record<string, unknown>);
}

/**
 * 班级请假总览（辅导员视角）。后端按 counselor 当前班级范围过滤；
 * 可选 status / leave_type_code / 日期 范围进一步收窄。
 */
export function listClassLeaves(params: LeaveQueryParams) {
  return get<MiniPage<LeaveRequest>>('/leaves/class', params as unknown as Record<string, unknown>);
}

/**
 * 未销假总览：已批准但学生未提交销假，或已过结束时间还没销。辅导员处理
 * "学生忘记销假"的入口。
 */
export function listUncancelledLeaves(params: LeaveQueryParams) {
  return get<MiniPage<LeaveRequest>>('/leaves/uncancelled', params as unknown as Record<string, unknown>);
}

export function getLeaveDetail(id: string) {
  return get<LeaveRequest>(`/leaves/${id}`);
}

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

export function applyLeave(data: LeaveApplyData) {
  return post<LeaveRequest>('/leaves', data);
}

export function withdrawLeave(id: string) {
  return post<void>(`/leaves/${id}/withdraw`);
}

export function cancelLeave(id: string) {
  return post<void>(`/leaves/${id}/cancel`);
}

/** 辅导员侧确认学生提交的销假申请（status: cancel_pending → cancelled）。 */
export function confirmCancelLeave(id: string) {
  return post<void>(`/leaves/${id}/cancel-confirm`);
}

/** 辅导员强制销假（学生未提交销假或异常情况），不可撤销。 */
export function forceCancelLeave(id: string) {
  return post<void>(`/leaves/${id}/force-cancel`);
}

/* ── 销假改造后的 GPS / 人工销假 ─────────────────────
 * 销假改造删了 leave_return workflow,主链路:学生 GPS 命中即销;
 * 不命中走人工兜底,辅导员单步审一下。 */

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

export function returnByLocation(
  id: string,
  latitude: number,
  longitude: number,
  capturedAt: string,
) {
  return post<ReturnByLocationResult>(`/leaves/${id}/return/by-location`, {
    latitude,
    longitude,
    capturedAt,
  });
}

export function applyManualReturn(
  id: string,
  reason: string,
  attachments: FileRef[],
) {
  return post<LeaveRequest>(`/leaves/${id}/return/manual-apply`, {
    reason,
    attachments,
  });
}

/* ── 请假影响课程视图 ─────────────────────────────────
 * 辅导员审批时点 trigger 展开看具体被耽误的课。
 * 数据缺失（无课表 / 跨学期）返回 zero 视图，UI 用 total_periods === 0 判空态。 */

export interface LeaveImpactCourseSlot {
  course_name: string;
  teacher: string | null;
  location: string | null;
  start_period: number;
  end_period: number;
  color: string | null;
}

export interface LeaveImpactDay {
  date: string;            // YYYY-MM-DD
  day_of_week: number;     // ISO 1=Mon..7=Sun
  week: number;            // 教学周 1-based
  courses: LeaveImpactCourseSlot[];
}

export interface LeaveImpactView {
  total_periods: number;
  total_courses: number;
  total_days: number;
  term_code: string | null;
  by_day: LeaveImpactDay[];
}

export function getLeaveImpact(id: string) {
  return get<LeaveImpactView>(`/leaves/${id}/impact`);
}

/** 学生填表时实时预览会缺的课程。后端按 X-User-Id 取 student_id;
 *  非学生身份会返回 zero 视图,前端按 total_periods 判空态隐藏。 */
export function previewLeaveImpact(start: string, end: string) {
  return get<LeaveImpactView>('/leaves/impact/preview', { start, end });
}

/**
 * 学生本学期累计请假天数 + 是否超过全局上限。
 * cap_days==null 时前端不渲染软警告;exceeded=true 时申请页顶端红条提示,
 * 同时审批侧会按高风险标记,但不阻断提交。
 */
export interface LeaveTermUsage {
  term_name: string | null;
  accumulated_days: number;
  cap_days: number | null;
  exceeded: boolean;
  /** 按假别拆分,按 days 倒序;空数组表示本学期未请过假。 */
  by_type: LeaveTermUsageByType[];
  /** 近 30 天 status∈{pending,approved} 的请假条数(跨学期口径)。 */
  recent_count_30d: number;
}
export interface LeaveTermUsageByType {
  code: string;
  name: string;
  days: number;
}
export function getMyTermUsage() {
  return get<LeaveTermUsage>('/leaves/term-usage');
}

/** 「请假须知」配置 —— 仅学生端请假页消费,缺值时后端会返回内置默认文案。
 *  字段命名跟后端 Jackson SNAKE_CASE 全局策略对齐。 */
export interface LeaveNoticeConfig {
  notice_enabled: boolean;
  notice_text: string;
  commitment_enabled: boolean;
  commitment_text: string;
  commitment_countdown_sec: number;
}
export function getLeaveNoticeConfig() {
  return get<LeaveNoticeConfig>('/leaves/notice/config');
}

/**
 * 请假天数预览(对齐后端 LeaveCalendarService slot-coverage 口径):
 *   每个日历日两个 slot(上午 09:00–12:00 / 下午 13:00–18:00),
 *   请假区间与 slot 有任何重叠 = +0.5 天。**每天都按工作日切**,
 *   不区分周末/节假日(学校拿不到稳定假期数据)。
 *
 * `start` / `end` 是 ms-since-epoch。结果天然落在 0.5 倍数。
 */
export function calculateDurationDays(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const MORNING_START_SEC = 9 * 3600;
  const MORNING_END_SEC = 12 * 3600;
  const AFTERNOON_START_SEC = 13 * 3600;
  const AFTERNOON_END_SEC = 18 * 3600;

  const startMs = Math.floor(start);
  const endMs = Math.floor(end);
  let halfSlots = 0;

  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(endMs);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= lastDay.getTime()) {
    const dayStartMs = cursor.getTime();
    const segs: Array<[number, number]> = [
      [MORNING_START_SEC, MORNING_END_SEC],
      [AFTERNOON_START_SEC, AFTERNOON_END_SEC],
    ];
    for (const [a, b] of segs) {
      const segStart = dayStartMs + a * 1000;
      const segEnd = dayStartMs + b * 1000;
      // 经典区间相交:start < segEnd && end > segStart
      if (startMs < segEnd && endMs > segStart) halfSlots += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return halfSlots * 0.5;
}
