export type RiskLevel = 'low' | 'medium' | 'high';
export interface MiniPendingTask {
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
    leave_duration_days: string | null;
    leave_type_name: string | null;
    leave_reason: string | null;
    leave_start_time: string | null;
    leave_end_time: string | null;
}
export interface MiniPage<T> {
    data: T[];
    total: number | string;
}
export interface PendingQuery {
    page: number;
    size: number;
    assigneeId: string;
}
export declare function listPendingEnriched(params: PendingQuery): Promise<MiniPage<MiniPendingTask>>;
export declare function approveTask(taskId: string, comment?: string): Promise<void>;
export declare function rejectTask(taskId: string, comment?: string): Promise<void>;
//# sourceMappingURL=workflow.d.ts.map