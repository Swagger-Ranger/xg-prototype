import { Tag } from 'antd';
import type { CareSeverity, CareStatus } from '@/api/care';

// W1 §4.2：沿用 Antd 语义色名（映射主题 token），不引入自定义色板。
const SEVERITY: Record<CareSeverity, { label: string; color: string }> = {
  critical: { label: '紧急', color: 'error' },
  high: { label: '高', color: 'warning' },
  medium: { label: '关注', color: 'processing' },
  low: { label: '提醒', color: 'default' },
};

// W1 §4.3：仅非 pending 显示状态徽章（pending 靠严重度色表达）。
const STATUS: Partial<Record<CareStatus, { label: string; color: string }>> = {
  accepted: { label: '已接', color: 'processing' },
  in_progress: { label: '跟进中', color: 'processing' },
  resolved: { label: '已完成', color: 'success' },
  rejected: { label: '已拒绝', color: 'default' },
  transferred: { label: '已转介', color: 'default' },
  overdue: { label: '已超期', color: 'error' },
};

export function SeverityBadge({ severity }: { severity: CareSeverity }) {
  const c = SEVERITY[severity];
  return <Tag color={c.color}>{c.label}</Tag>;
}

export function StatusBadge({ status }: { status: CareStatus }) {
  const c = STATUS[status];
  if (!c) return null;
  return <Tag color={c.color}>{c.label}</Tag>;
}
