import api from './index';

/**
 * AI 观察员卡(院长 / 学工部部长 用 NL 配的可视化卡)前端 API 客户端。
 *
 * 数据流:
 *   1. propose(NL)         → sidecar LLM 出 sql + chart_suggestions + title
 *   2. preview(sql)        → backend QueryGuard 试跑 LIMIT 20 拿 sample
 *   3. createCard(...)     → backend 保存(后端再做一次 QueryGuard.explainOnly 拿 cost)
 *   4. runCard(id)         → workspace 渲染时调,带 5min 缓存
 */

export type ChartType = 'statistic' | 'bar' | 'line' | 'pie' | 'table' | 'trend';

export interface ChartSuggestion {
  type: ChartType;
  reason: string;
  x?: string | null;
  y?: string | null;
  series?: string | null;
}

export interface ProposeResp {
  ok: boolean;
  sql?: string | null;
  chart_suggestions?: ChartSuggestion[] | null;
  title_suggestion?: string | null;
  ai_message: string;
  error_code?: string | null;
}

/** 拉 sidecar 出 SQL+图建议。Sidecar 路径,跟其它 ai-only 工具一样走 /ai/... vite proxy。 */
export async function proposeObserverCard(nlQuery: string, ownerRole: string): Promise<ProposeResp> {
  const token = localStorage.getItem('xg_token');
  const res = await fetch('/ai/api/v1/ai-observer/propose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ nl_query: nlQuery, owner_role: ownerRole }),
  });
  return res.json();
}

export interface GuardWarning {
  rows: Array<Record<string, unknown>>;
  plan_cost: number;
  plan_rows: number;
  actual_ms: number;
  cached: boolean;
  warnings: string[];
}

/** 后端 preview:走 QueryGuard 真跑 LIMIT 20。返回 rows + cost + warnings。 */
export function previewObserverSql(sqlText: string): Promise<GuardWarning> {
  return api.post('/ai-observer/preview', { sql_text: sqlText }).then((r) => r.data);
}

export interface ObserverCard {
  id: string;
  title: string;
  nl_query: string;
  chart_type: ChartType;
  chart_opts: Record<string, unknown> | null;
  refresh_sec: number;
  cost_estimate: number | null;
  rows_estimate: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SaveCardPayload {
  title: string;
  nl_query: string;
  sql_text: string;
  chart_type: ChartType;
  chart_opts?: Record<string, unknown>;
  refresh_sec?: number;
}

export function listMyObserverCards(): Promise<ObserverCard[]> {
  return api.get('/ai-observer/cards').then((r) => r.data);
}

export function createObserverCard(p: SaveCardPayload): Promise<ObserverCard> {
  return api.post('/ai-observer/cards', p).then((r) => r.data);
}

export function updateObserverCard(id: string, p: SaveCardPayload): Promise<ObserverCard> {
  return api.put(`/ai-observer/cards/${id}`, p).then((r) => r.data);
}

export function deleteObserverCard(id: string): Promise<void> {
  return api.delete(`/ai-observer/cards/${id}`).then(() => undefined);
}

export function runObserverCard(id: string, bypassCache = false): Promise<GuardWarning> {
  return api
    .post(`/ai-observer/cards/${id}/run`, null, { params: { bypass_cache: bypassCache } })
    .then((r) => r.data);
}
