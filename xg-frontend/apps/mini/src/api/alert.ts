/**
 * Alert summary (mini) — 仅给首页"今日简报"取 open_total + 严重度分桶。
 * 详情列表 / 处置动作走 web，mini 暂不暴露完整 alerts CRUD。
 */
import { get } from '../utils/request';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AlertSummary {
  /** Long → string on wire；前端转 number 自处理 */
  open_total: string;
  by_severity: Partial<Record<AlertSeverity, string>>;
}

export function getAlertSummary() {
  return get<AlertSummary>('/alerts/summary');
}
