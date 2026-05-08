import type {
  InstanceTimeline,
  PageResult,
  PendingTaskEnriched,
  TaskInstance,
  WorkflowDefinition,
} from '@xg1/shared';
import api from './index';

export interface TaskQueryParams {
  page: number;
  size: number;
  assigneeId?: string;
}

export interface DefinitionQueryParams {
  page: number;
  size: number;
  bizType?: string;
  status?: string;
  code?: string;
}

export interface CreateDefinitionPayload {
  code: string;
  name: string;
  module?: string;
  bizType?: string;
  configYaml: string;
}

export interface UpdateDefinitionPayload {
  name?: string;
  bizType?: string;
  configYaml: string;
}

export function listDefinitions(params: DefinitionQueryParams): Promise<PageResult<WorkflowDefinition>> {
  return api.get('/workflows/definitions', { params }).then((res) => res.data);
}

export function getDefinition(id: string): Promise<WorkflowDefinition> {
  return api.get(`/workflows/definitions/${id}`).then((res) => res.data);
}

export function createDefinition(payload: CreateDefinitionPayload): Promise<WorkflowDefinition> {
  return api.post('/workflows/definitions', payload).then((res) => res.data);
}

export function updateDefinition(id: string, payload: UpdateDefinitionPayload): Promise<WorkflowDefinition> {
  return api.put(`/workflows/definitions/${id}`, payload).then((res) => res.data);
}

export function publishDefinition(id: string): Promise<WorkflowDefinition> {
  return api.post(`/workflows/definitions/${id}/publish`).then((res) => res.data);
}

export interface RoleCode {
  code: string;
  name: string;
}

export function getWorkflowRoleCodes(): Promise<RoleCode[]> {
  return api.get('/workflows/role-codes').then((res) => res.data);
}

export interface ProposeEditResponse {
  ok: boolean;
  dsl?: Record<string, unknown>;
  summary?: string;
  error_message?: string;
  attempts?: { errors: string[]; dsl: unknown }[];
}

export function proposeWorkflowEdit(
  currentDsl: Record<string, unknown>,
  instruction: string,
): Promise<ProposeEditResponse> {
  // DeepSeek often needs 20-40s to author a full DSL; the default 15s axios
  // timeout is too aggressive for this single endpoint.
  return api
    .post('/workflows/definitions/author', { currentDsl, instruction }, { timeout: 90_000 })
    .then((res) => res.data);
}

export type SchemaChangeLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface SchemaChange {
  level: SchemaChangeLevel;
  field: string;
  kind: string;
  message: string;
}

export interface DiffPreview {
  changes: SchemaChange[];
  maxLevel: SchemaChangeLevel;
  blocked: boolean;
}

export function getDiffPreview(id: string): Promise<DiffPreview> {
  return api.get(`/workflows/definitions/${id}/diff-preview`).then((res) => res.data);
}

export function getPendingTasks(params: TaskQueryParams): Promise<PageResult<TaskInstance>> {
  return api.get('/workflows/tasks/pending', { params }).then((res) => res.data);
}

export function getPendingEnriched(params: TaskQueryParams): Promise<PageResult<PendingTaskEnriched>> {
  return api.get('/workflows/tasks/pending-enriched', { params }).then((res) => res.data);
}

export type AiRecommendation =
  | 'approve'
  | 'caution'
  | 'reject'
  | '';

export interface TaskAiRecommendation {
  model: string;
  recommendation: AiRecommendation;
  headline: string;
  rationale: string;
  checkpoints: string[];
  error_message: string | null;
}

export function getTaskAiRecommendation(taskId: string): Promise<TaskAiRecommendation> {
  return api
    .get(`/workflows/tasks/${taskId}/ai-recommendation`)
    .then((res) => res.data);
}

export function getTaskHistory(params: TaskQueryParams): Promise<PageResult<TaskInstance>> {
  return api.get('/workflows/tasks/history', { params }).then((res) => res.data);
}

// Backend ApprovalRequest / BatchApproveRequest both declare operatorId as
// @NotNull. The X-User-Id header is set by the api client interceptor, but
// these specific endpoints want it in the body — so pull it from local
// storage and include it explicitly.
function currentOperatorId(): string | null {
  try {
    const u = localStorage.getItem('xg_user');
    if (!u) return null;
    return JSON.parse(u)?.id ?? null;
  } catch {
    return null;
  }
}

export function approveTask(taskId: string, comment?: string): Promise<void> {
  return api
    .post(`/workflows/tasks/${taskId}/approve`, { comment, operator_id: currentOperatorId() })
    .then(() => undefined);
}

export function rejectTask(taskId: string, comment?: string): Promise<void> {
  return api
    .post(`/workflows/tasks/${taskId}/reject`, { comment, operator_id: currentOperatorId() })
    .then(() => undefined);
}

export function batchApproveTasks(taskIds: string[], action: 'approve' | 'reject', comment?: string): Promise<unknown> {
  return api
    .post('/workflows/tasks/batch-approve', {
      task_ids: taskIds,
      action,
      comment,
      operator_id: currentOperatorId(),
    })
    .then((res) => res.data);
}

// Fire-and-forget feedback log: pairs the AI recommendation we showed the
// approver with the decision they ultimately made, so we can measure
// agreement rate over time. Backend swallows failures; we additionally
// catch here so a 4xx/network error never bubbles to the toast UI.
export interface LogAiRecommendationPayload {
  task_id: string;
  biz_type?: string;
  biz_id?: string | null;
  ai_recommendation?: string;
  ai_headline?: string;
  ai_rationale?: string;
  ai_model?: string;
  human_decision: 'approve' | 'reject';
  human_comment?: string;
}

export function logAiRecommendation(payload: LogAiRecommendationPayload): void {
  api.post('/ai-recommendations/log', payload).catch(() => {
    // Observational endpoint — silently drop on failure.
  });
}

export type FormFieldType = 'string' | 'number' | 'boolean' | 'date' | 'file';
export type FormFieldWidget = 'textarea' | 'radio' | 'select' | 'signature' | 'cascader';

export interface FormFieldSchema {
  name: string;
  label?: string;
  type?: FormFieldType;
  required?: boolean;
  options?: string[] | null;
  indexed?: boolean;
  deprecated?: boolean;
  placeholder?: string | null;
  pattern?: string | null;
  widget?: FormFieldWidget | null;
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  fileMaxCount?: number | null;
  fileAccept?: string | null;
  fileMaxSizeKb?: number | null;
}

export interface FormSchema {
  fields: FormFieldSchema[];
}

export function getFormSchema(params: { bizType?: string; instanceId?: string | number }): Promise<FormSchema> {
  return api.get('/workflows/form-schema', { params }).then((res) => res.data);
}

export function getInstanceTimeline(instanceId: string | number): Promise<InstanceTimeline> {
  return api.get(`/workflows/instances/${instanceId}/timeline`).then((res) => res.data);
}

export interface FormFieldPayload {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  deprecated?: boolean;
  placeholder?: string | null;
  pattern?: string | null;
  widget?: FormFieldWidget | null;
  options?: string[] | null;
  min?: number | null;
  max?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
  fileMaxCount?: number | null;
  fileAccept?: string | null;
  fileMaxSizeKb?: number | null;
}

export function updateFormFields(
  definitionId: string | number,
  fields: FormFieldPayload[],
): Promise<WorkflowDefinition> {
  return api
    .put(`/workflows/definitions/${definitionId}/form-fields`, { fields })
    .then((res) => res.data);
}

