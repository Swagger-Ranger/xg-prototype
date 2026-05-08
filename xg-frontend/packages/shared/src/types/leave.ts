export interface LeaveTypeConfig {
  id: string;
  code: string;
  name: string;
  parent_code: string | null;
  extra_fields: LeaveExtraField[];
  require_attachment: boolean;
  enabled: boolean;
  /** 单次请假上限(天)。null = 不限。 */
  max_days?: number | null;
  /** 本学期累计上限(天,可半天)。null = 不限。 */
  term_max_days?: number | null;
}

export interface LeaveExtraField {
  field_key: string;
  field_label: string;
  field_type: 'text' | 'select' | 'date' | 'file';
  required: boolean;
  options?: string[];
  visible_when?: string;
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
  ai_draft: AiDraft | null;
  apply_latitude?: number | null;
  apply_longitude?: number | null;
  apply_location_at?: string | null;
  return_latitude?: number | null;
  return_longitude?: number | null;
  return_location_at?: string | null;
  /** 销假来源:gps / manual_approve / manual_force / access_card。null = 还没销 */
  return_source?: string | null;
  /** 学生申请人工销假理由(GPS 不命中时的兜底通道) */
  manual_return_reason?: string | null;
  /** 学生申请人工销假上传的附件 */
  manual_return_attachments?: FileRef[] | null;
  manual_return_submitted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type LeaveStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'cancel_pending'
  | 'pending_manual_return';

export interface FileRef {
  file_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
}

export interface AiDraft {
  source: string;
  model: string;
  raw_input: string;
  predicted_fields: Record<string, unknown>;
  confidence: number;
  generated_at: string;
}
