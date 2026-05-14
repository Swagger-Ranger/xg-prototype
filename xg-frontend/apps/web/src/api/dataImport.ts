import api from './index';

export type ImportScenario = 'student' | 'teacher' | 'counselor';

export type ImportStatus =
  | 'created'
  | 'parsed'
  | 'mapped'
  | 'org_previewed'
  | 'validated'
  | 'executing'
  | 'executed'
  | 'failed';

export interface TargetField {
  key: string;
  label: string;
  required: boolean;
  category?: string | null;
}

export interface ColumnMappingRow {
  source_col: string;
  source_index: number;
  /** null = 不导入这列 */
  target: string | null;
  /** 0..1 */
  confidence: number;
  /** ai | heuristic | user */
  source: 'ai' | 'heuristic' | 'user';
}

export interface ColumnMapping {
  targets: TargetField[];
  mappings: ColumnMappingRow[];
}

export interface DataImportSession {
  id: string;
  scenario: ImportScenario;
  status: ImportStatus;
  file_name?: string;
  total_rows?: number;
  intent_text?: string;
  mapping_intent?: string;
  error_message?: string;
  headers?: string[];
  samples?: string[][];
  column_mapping?: ColumnMapping;
  org_preview?: OrgPreview;
  validation_report?: ValidationReport;
  strategy?: { on_conflict?: ConflictStrategy };
  result_summary?: ResultSummary;
}

/** Step 1：创建会话 + 上传 + 立即解析，回包含 headers/samples 的视图。 */
export function createSession(
  scenario: ImportScenario,
  file: File,
): Promise<DataImportSession> {
  const fd = new FormData();
  fd.append('scenario', scenario);
  fd.append('file', file);
  return api
    .post('/data-import/sessions', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
    .then((res) => res.data);
}

export function getSession(id: string): Promise<DataImportSession> {
  return api.get(`/data-import/sessions/${id}`).then((res) => res.data);
}

/** Step 2 进入：触发 AI + 启发式列映射建议。 */
export function autoMapSession(id: string): Promise<DataImportSession> {
  return api.post(`/data-import/sessions/${id}/auto-map`, {}).then((res) => res.data);
}

/** Step 2 手改一列。target_key 空字符串 / null = 不导入这列。 */
export function overrideMapping(
  id: string,
  sourceIndex: number,
  targetKey: string | null,
): Promise<DataImportSession> {
  return api
    .patch(`/data-import/sessions/${id}/mapping`, {
      sourceIndex,
      targetKey: targetKey ?? '',
    })
    .then((res) => res.data);
}

/** Step 3 入场（学生场景）：推断组织树预览。 */
export function previewOrgTree(id: string): Promise<DataImportSession> {
  return api
    .post(`/data-import/sessions/${id}/org-preview`)
    .then((res) => res.data);
}

export interface OrgPreviewNode {
  name: string;
  type: 'college' | 'major' | 'class';
  status: 'existing' | 'to_create';
  id?: number;
  children?: OrgPreviewNode[];
}

export interface OrgPreview {
  tree: OrgPreviewNode[];
  stats: {
    create_colleges: number;
    create_majors: number;
    create_classes: number;
    existing_colleges: number;
    existing_majors: number;
    existing_classes: number;
  };
  errors: { row: number; message: string }[];
}

export interface ValidationReport {
  pass: number;
  warn: number;
  error: number;
  errors: { row: number; col?: string; message: string }[];
  warnings: { row: number; col?: string; message: string; kind?: string }[];
  conflict_count: number;
}

export interface ResultSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** 教师场景：本次顺手建的机关部门数 */
  orgs_created?: number;
  orgs_created_names?: string[];
  failures: { row: number; message: string }[];
}

export type ConflictStrategy = 'update' | 'skip';

export function validateSession(id: string): Promise<DataImportSession> {
  return api.post(`/data-import/sessions/${id}/validate`).then((res) => res.data);
}

export function executeSession(
  id: string,
  strategy: ConflictStrategy,
): Promise<DataImportSession> {
  return api
    .post(`/data-import/sessions/${id}/execute`, { strategy })
    .then((res) => res.data);
}
