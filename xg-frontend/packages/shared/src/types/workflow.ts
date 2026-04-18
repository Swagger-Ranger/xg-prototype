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
