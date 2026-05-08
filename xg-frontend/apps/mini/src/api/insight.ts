/**
 * Workspace insight client (mini).
 *
 * 后端 `/insights?role=counselor|dean` 返回最新 LLM 生成的 InsightItem 列表，
 * 是 sidecar 离线生成、定时刷新的快照——load 失败 / status 非 ready 时
 * 上层应当回退到规则化文案，永远不要把空状态当错误丢给用户。
 *
 * 学生角色没有 workspace insight，不要调用此接口。
 */
import { get } from '../utils/request';

export type InsightSeverity = 'info' | 'warn' | 'critical';

export interface InsightItem {
  severity: InsightSeverity;
  category: string;
  title: string;
  detail: string;
  suggestion: string;
  evidence?: string[];
}

export interface WorkspaceInsight {
  id: string | null;
  role: 'counselor' | 'dean';
  scope_key: string;
  generated_at: string;
  expired_at: string | null;
  model: string;
  /** 原 JSON 字符串；用 parseInsights 解析。 */
  insights: string;
  status: 'ready' | 'error' | 'pending';
  error_message: string | null;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

export function getLatestInsight(role: 'counselor' | 'dean'): Promise<WorkspaceInsight | null> {
  return get<WorkspaceInsight | null>('/insights', { role });
}

export function parseInsights(raw: string | null | undefined): InsightItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 按严重度排序，未识别 severity 视为 info（最末尾）。 */
export function sortBySeverity(items: InsightItem[]): InsightItem[] {
  return [...items].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99),
  );
}
