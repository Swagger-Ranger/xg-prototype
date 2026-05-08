export type WorkflowStatus = 'running' | 'completed' | 'rejected' | 'cancelled' | 'timeout';

export interface WorkflowInstance {
  id: string;
  definition_id: string;
  business_type: string;
  business_id: string;
  initiator_id: string;
  initiator_name: string;
  status: WorkflowStatus;
  current_node_id: string | null;
  started_at: string;
  finished_at: string | null;
}

export type TaskStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'timeout';

export interface TaskInstance {
  id: string;
  workflow_instance_id: string;
  node_id: string;
  node_name: string;
  assignee_id: string;
  assignee_name: string;
  status: TaskStatus;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApplicantStats {
  absent30d: number;
  leave_count30d: number;
  open_alerts_critical: number;
  open_alerts_high: number;
  open_alerts_medium: number;
  open_alerts_low: number;
  unpunished_violations: number;
  violation90d: number;
}

export interface PendingTaskEnriched {
  id: string;
  workflow_instance_id: string;
  node_id: string;
  node_name: string;
  assignee_id: string;
  due_at: string | null;
  assigned_at: string | null;

  biz_type: string | null;
  biz_id: string | null;
  initiator_id: string | null;
  initiator_name: string | null;
  started_at: string | null;

  risk_level: RiskLevel;
  reasons: string[];
  applicant_stats: ApplicantStats;

  leave_duration_days: string | null;
  leave_type_name: string | null;
  leave_reason: string | null;
  leave_start_time: string | null;
  leave_end_time: string | null;
}

export interface ApprovalAction {
  task_id: string;
  action: 'approve' | 'reject';
  comment?: string;
}

export interface BatchApprovalAction {
  task_ids: string[];
  action: 'approve' | 'reject';
  comment?: string;
}

export type WorkflowDefinitionStatus = 'draft' | 'published' | 'disabled';

export interface WorkflowDefinition {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  version: number;
  module: string | null;
  biz_type: string | null;
  config_yaml: string;
  config_json: Record<string, unknown>;
  status: WorkflowDefinitionStatus;
  created_at: string;
  updated_at: string;
}

export type TimelineNodeState = 'completed' | 'in_progress' | 'pending';
export type TimelineNodeType = 'form_submit' | 'approval' | 'notification' | 'end';

export interface TimelineActor {
  id: string | null;
  name: string | null;
  role: string | null;
}

export interface TimelineNode {
  id: string;
  name: string;
  type: TimelineNodeType;
  state: TimelineNodeState;
  completed_at?: string | null;
  decision?: 'approved' | 'rejected' | null;
  duration_ms?: number | null;
  comment?: string | null;
  due_at?: string | null;
  actor?: TimelineActor | null;
  skip_label?: string | null;
  current_for_viewer?: boolean;
}

export interface OutcomePreview {
  on_approve: string | null;
  on_reject: string | null;
}

export interface InstanceTimeline {
  instance_id: string;
  biz_type: string | null;
  status: WorkflowStatus;
  current_node_id: string | null;
  nodes: TimelineNode[];
  outcome_preview: OutcomePreview | null;
}
