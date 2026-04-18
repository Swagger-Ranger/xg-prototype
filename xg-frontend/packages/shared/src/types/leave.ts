export interface LeaveTypeConfig {
  id: string;
  code: string;
  name: string;
  parent_code: string | null;
  extra_fields: LeaveExtraField[];
  require_attachment: boolean;
  enabled: boolean;
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
  created_at: string;
  updated_at: string;
}

export type LeaveStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'cancel_pending';

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
