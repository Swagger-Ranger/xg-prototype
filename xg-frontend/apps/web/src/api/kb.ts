// KB management — calls go directly to the AI sidecar via the /ai/* vite
// proxy (sidecar strips /ai). No axios interceptor here because the sidecar
// returns plain JSON instead of the {code,data,message} envelope used by the
// Java backend; we keep envelope handling at fetch sites.

const KB_BASE = '/ai/api/v1/kb';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const u = localStorage.getItem('xg_user');
    if (u) {
      const user = JSON.parse(u);
      if (user?.id) headers['X-User-Id'] = String(user.id);
      if (user?.tenant_id) headers['X-Tenant-Id'] = String(user.tenant_id);
    }
  } catch { /* ignore */ }
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${KB_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail || body?.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json();
}

// ---------- Types ----------

export type RetrievalMode = 'vector' | 'keyword' | 'hybrid';
export type IndexingStatus = 'pending' | 'processing' | 'done' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  embedding_dim: number;
  rerank_model: string | null;
  chunk_size: number;
  chunk_overlap: number;
  retrieval_mode: RetrievalMode;
  top_k: number;
  score_threshold: number | null;
  doc_count: number;
  chunk_count: number;
  last_eval_at: string | null;
  last_eval_result: EvalResult | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EvalCase {
  id: string;
  kb_id: string;
  query: string;
  expected_doc_ids: string[];
  note: string | null;
  created_at: string | null;
}

export interface EvalCaseHit {
  document_id: string;
  document_name: string | null;
  rank: number;
  score: number;
}

export interface EvalCaseDetail {
  case_id: string;
  query: string;
  expected_doc_ids: string[];
  hits: EvalCaseHit[];
  hit_rank: number | null;
  passed: boolean;
}

export interface EvalResult {
  top_k: number;
  total_cases: number;
  passed_cases: number;
  recall_at_k: number;
  mrr: number;
  ran_at: string;
  per_case: EvalCaseDetail[];
}

export interface EvalCaseCreatePayload {
  query: string;
  expected_doc_ids: string[];
  note?: string;
}

export interface KbDocument {
  id: string;
  kb_id: string;
  name: string;
  source_type: 'file' | 'url' | 'manual';
  source_meta: Record<string, unknown> | null;
  file_size_bytes: number | null;
  char_count: number | null;
  chunk_count: number | null;
  enabled: boolean;
  indexing_status: IndexingStatus;
  indexing_error: string | null;
  indexed_at: string | null;
  created_at: string | null;
}

export interface KbChunk {
  id: string;
  document_id: string;
  kb_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  char_count: number | null;
  enabled: boolean;
}

export interface KbCreatePayload {
  name: string;
  description?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  retrieval_mode?: RetrievalMode;
  top_k?: number;
  score_threshold?: number | null;
  embedding_model?: string;
  rerank_model?: string | null;
}

export interface KbUpdatePayload {
  name?: string;
  description?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  retrieval_mode?: RetrievalMode;
  top_k?: number;
  score_threshold?: number | null;
  rerank_model?: string | null;
}

export interface HitTestRequest {
  query: string;
  top_k?: number;
  mode?: RetrievalMode;
}

export interface HitTestResult {
  chunk_id: number;
  document_id: number;
  document_name: string | null;
  chunk_index: number;
  content: string;
  score: number;
  source: string;
}

// ---------- Endpoints ----------

export function listKbs(): Promise<KnowledgeBase[]> {
  return request<KnowledgeBase[]>('');
}

export function createKb(payload: KbCreatePayload): Promise<KnowledgeBase> {
  return request<KnowledgeBase>('', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getKb(id: string): Promise<KnowledgeBase> {
  return request<KnowledgeBase>(`/${id}`);
}

export function updateKb(id: string, payload: KbUpdatePayload): Promise<KnowledgeBase> {
  return request<KnowledgeBase>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteKb(id: string): Promise<void> {
  return request<void>(`/${id}`, { method: 'DELETE' });
}

export function listDocuments(kbId: string): Promise<KbDocument[]> {
  return request<KbDocument[]>(`/${kbId}/documents`);
}

export async function uploadDocument(kbId: string, file: File): Promise<KbDocument> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${KB_BASE}/${kbId}/documents`, {
    method: 'POST',
    body: fd,
    headers: authHeaders(),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail || body?.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`上传失败 ${res.status}: ${detail}`);
  }
  return res.json();
}

export function deleteDocument(docId: string): Promise<void> {
  return request<void>(`/documents/${docId}`, { method: 'DELETE' });
}

export function listChunks(docId: string): Promise<KbChunk[]> {
  return request<KbChunk[]>(`/documents/${docId}/chunks`);
}

export function toggleChunk(chunkId: string, enabled: boolean): Promise<void> {
  return request<void>(`/chunks/${chunkId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function hitTest(kbId: string, payload: HitTestRequest): Promise<HitTestResult[]> {
  return request<HitTestResult[]>(`/${kbId}/hit-test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------- Eval ----------

export function listEvalCases(kbId: string): Promise<EvalCase[]> {
  return request<EvalCase[]>(`/${kbId}/eval/cases`);
}

export function createEvalCase(
  kbId: string, payload: EvalCaseCreatePayload,
): Promise<{ id: string }> {
  return request<{ id: string }>(`/${kbId}/eval/cases`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteEvalCase(caseId: string): Promise<void> {
  return request<void>(`/eval/cases/${caseId}`, { method: 'DELETE' });
}

export function runEvaluation(
  kbId: string, topK?: number,
): Promise<EvalResult> {
  return request<EvalResult>(`/${kbId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ top_k: topK }),
  });
}
