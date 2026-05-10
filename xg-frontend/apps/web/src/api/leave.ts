import type { LeaveTypeConfig, LeaveRequest } from '@xg1/shared';
import type { PageResult } from '@xg1/shared';
import api from './index';
import type { FormFieldPayload, FormFieldSchema } from './workflow';

export interface LeaveApplyData {
  leave_type_code: string;
  start_time: string;
  end_time: string;
  reason: string;
  attachment_file_ids?: string[];
  extra_data?: Record<string, unknown>;
  apply_latitude?: number;
  apply_longitude?: number;
  apply_location_at?: string;
  /**
   * Snapshot of what AI prefilled when the form was opened via chat agent.
   * Used by analytics to compare AI predictions against the student's final
   * submitted values; null when the form was opened manually.
   */
  ai_draft?: {
    source: string;            // e.g. 'chat_agent'
    model?: string;            // optional — caller may not know which LLM
    raw_input?: string;        // the user message that triggered the prefill
    predicted_fields: Record<string, unknown>;
    confidence?: number;       // 0..1 if available
    generated_at: string;      // ISO
  };
}

export interface LeaveQueryParams {
  page: number;
  size: number;
  status?: string;
  leave_type_code?: string;
  start_date?: string;
  end_date?: string;
}

export function getLeaveTypes(): Promise<LeaveTypeConfig[]> {
  return api.get('/leave-types').then((res) => res.data);
}

export function applyLeave(data: LeaveApplyData): Promise<LeaveRequest> {
  return api.post('/leaves', data).then((res) => res.data);
}

export function getMyLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/my', { params }).then((res) => res.data);
}

export function getLeaveDetail(id: string): Promise<LeaveRequest> {
  return api.get(`/leaves/${id}`).then((res) => res.data);
}

export function withdrawLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/withdraw`).then(() => undefined);
}

export function cancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/cancel`).then(() => undefined);
}

export function getClassLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/class', { params }).then((res) => res.data);
}

export function getUncancelledLeaves(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/uncancelled', { params }).then((res) => res.data);
}

/** 销假改造后:学生 GPS 不命中走人工兜底,辅导员在这里看待审列表。 */
export function getPendingManualReturns(params: LeaveQueryParams): Promise<PageResult<LeaveRequest>> {
  return api.get('/leaves/pending-manual-returns', { params }).then((res) => res.data);
}

/**
 * 全局学期累计上限(替代原来的 per-假别 term_max_days)。null = 不限,
 * 行为是软警告 + 高风险标记,不再阻断学生提交;PendingTaskEnricher 也按这个判 high。
 */
export interface LeaveGlobalConfig {
  tenant_id: string | null;
  term_max_days: number | null;
  /** 学生提交请假时是否要求上传证明材料(全局开关) */
  require_proof?: boolean | null;
  updated_at?: string | null;
  updated_by?: number | null;
}
export function getLeaveGlobalConfig(): Promise<LeaveGlobalConfig> {
  return api.get('/leaves/global-config').then((res) => res.data);
}
export function updateLeaveGlobalConfig(termMaxDays: number | null): Promise<LeaveGlobalConfig> {
  return api
    .put('/leaves/global-config', { term_max_days: termMaxDays })
    .then((res) => res.data);
}
export function updateLeaveRequireProof(requireProof: boolean): Promise<LeaveGlobalConfig> {
  return api
    .put('/leaves/global-config/require-proof', { require_proof: requireProof })
    .then((res) => res.data);
}

/**
 * 学生 / 辅导员查本学期累计请假天数。学生申请页用 /term-usage,
 * 辅导员审批 drawer 用 /term-usage/{studentId}。
 */
export interface LeaveTermUsage {
  term_name: string | null;
  accumulated_days: number;
  cap_days: number | null;
  exceeded: boolean;
}
export function getMyTermUsage(): Promise<LeaveTermUsage> {
  return api.get('/leaves/term-usage').then((res) => res.data);
}
export function getStudentTermUsage(studentId: string | number): Promise<LeaveTermUsage> {
  return api.get(`/leaves/term-usage/${studentId}`).then((res) => res.data);
}

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

/**
 * 学生填表时实时预览该时段会缺的课程。后端按 X-User-Id 取 student_id 算,
 * 非学生(辅导员/管理员)调到自己的会自动返回 zero 视图。
 *
 * start/end 都是 ISO 格式字符串(含时区),后端按应用时区(Asia/Shanghai)解析。
 */
export function previewLeaveImpact(start: string, end: string): Promise<LeaveImpactView> {
  return api
    .get('/leaves/impact/preview', { params: { start, end } })
    .then((res) => res.data);
}

/** 审批侧用:拉某条已存在请假申请的影响课程(后端按 leaveRequest.studentId)。 */
export function getLeaveImpact(id: string): Promise<LeaveImpactView> {
  return api.get(`/leaves/${id}/impact`).then((res) => res.data);
}

/** 读 / 写「请假影响课程」全局开关。 */
export function getLeaveImpactConfig(): Promise<{ enabled: boolean }> {
  return api.get('/leaves/impact/config').then((res) => res.data);
}
export function updateLeaveImpactConfig(enabled: boolean): Promise<{ enabled: boolean }> {
  return api.put('/leaves/impact/config', { enabled }).then((res) => res.data);
}

/** 「请假须知」配置 —— 进入请假页弹「说明」+ 提交前弹「承诺书」(仅学生端)。
 *  字段命名跟后端 Jackson SNAKE_CASE 全局策略对齐。 */
export interface LeaveNoticeConfig {
  notice_enabled: boolean;
  notice_text: string;
  commitment_enabled: boolean;
  commitment_text: string;
  commitment_countdown_sec: number;
}
export function getLeaveNoticeConfig(): Promise<LeaveNoticeConfig> {
  return api.get('/leaves/notice/config').then((res) => res.data);
}
export function updateLeaveNoticeConfig(
  patch: Partial<LeaveNoticeConfig>,
): Promise<LeaveNoticeConfig> {
  return api.put('/leaves/notice/config', patch).then((res) => res.data);
}

/** 辅导员审核学生人工销假申请。approve=true 通过 → cancelled,false 退回 approved。 */
export function reviewManualReturn(id: string, approve: boolean): Promise<LeaveRequest> {
  return api
    .post(`/leaves/${id}/return/manual-review`, { approve })
    .then((res) => res.data);
}

export function confirmCancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/cancel-confirm`).then(() => undefined);
}

export function forceCancelLeave(id: string): Promise<void> {
  return api.post(`/leaves/${id}/force-cancel`).then(() => undefined);
}

export interface ReturnLeaveLocation {
  return_latitude: number;
  return_longitude: number;
  return_location_at: string;
}

export function requestLeaveReturn(
  id: string,
  formData: Record<string, unknown>,
  location?: ReturnLeaveLocation | null,
): Promise<LeaveRequest> {
  return api
    .post(`/leaves/${id}/return`, {
      form_data: formData,
      ...(location ?? {}),
    })
    .then((res) => res.data);
}

/**
 * Read GUI-editor-shaped fields for a leave type. The backend translates the
 * legacy {field_key/field_label/field_type/...} shape into FormFieldPayload.
 */
export function getLeaveTypeFields(code: string): Promise<FormFieldPayload[]> {
  return api.get(`/leave-types/${code}/extra-fields`).then((res) => res.data);
}

/**
 * Replace per-leave-type extra_fields. Takes effect immediately (no draft).
 */
export function updateLeaveTypeFields(
  code: string,
  fields: FormFieldPayload[],
): Promise<LeaveTypeConfig> {
  return api
    .put(`/leave-types/${code}/extra-fields`, { fields })
    .then((res) => res.data);
}

/**
 * Translate the legacy {field_key/field_label/field_type/...} extra_fields shape
 * (as stored in leave_type_config.extra_fields) into FormFieldSchema[] so
 * DynamicFormFields can render them uniformly with workflow form schemas.
 */
export function leaveTypeFieldsToSchema(
  raw: unknown,
): FormFieldSchema[] {
  let arr: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw)) {
    arr = raw as Array<Record<string, unknown>>;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  } else {
    return [];
  }

  return arr.map((r) => {
    const name = String(r.field_key ?? '');
    const label = String(r.field_label ?? '');
    const fieldType = String(r.field_type ?? 'text');
    const fieldWidget = r.field_widget != null ? String(r.field_widget) : null;
    const opts = Array.isArray(r.options) ? (r.options as unknown[]).map(String) : null;

    let type: FormFieldSchema['type'] = 'string';
    let widget: FormFieldSchema['widget'] = null;
    if (fieldType === 'select') {
      type = 'string';
      widget = fieldWidget === 'radio' ? 'radio' : 'select';
    } else if (fieldType === 'text') {
      type = 'string';
      if (fieldWidget === 'textarea') widget = 'textarea';
    } else if (fieldType === 'file') {
      type = 'file';
      if (fieldWidget === 'signature') widget = 'signature';
    } else if (
      fieldType === 'number' ||
      fieldType === 'boolean' ||
      fieldType === 'date'
    ) {
      type = fieldType;
    }

    return {
      name,
      label,
      type,
      widget,
      required: Boolean(r.required),
      deprecated: Boolean(r.deprecated),
      options: opts && opts.length > 0 ? opts : null,
      placeholder: typeof r.placeholder === 'string' ? r.placeholder : null,
      pattern: typeof r.pattern === 'string' ? r.pattern : null,
      minLength: typeof r.min_length === 'number' ? r.min_length : null,
      maxLength: typeof r.max_length === 'number' ? r.max_length : null,
      min: typeof r.min === 'number' ? r.min : null,
      max: typeof r.max === 'number' ? r.max : null,
      fileMaxCount: typeof r.file_max_count === 'number' ? r.file_max_count : null,
      fileAccept: typeof r.file_accept === 'string' ? r.file_accept : null,
      fileMaxSizeKb: typeof r.file_max_size_kb === 'number' ? r.file_max_size_kb : null,
    };
  });
}
