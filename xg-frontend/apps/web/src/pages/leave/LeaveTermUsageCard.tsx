import { Tag, Tooltip } from 'antd';
import type { LeaveTermUsage } from '@/api/leave';

/**
 * 学生申请页 / 辅导员审批 drawer 共用的"本学期累计"常驻卡片。
 * 总累计天数 + 按假别 chips + 近 30 天频次;exceeded 时叠一层红条警告。
 *
 * 主调用方:
 *   - LeaveApplyModal (variant="apply",学生自查视角)
 *   - LeaveDetailDrawer (variant="approve",辅导员审批视角)
 */
export default function LeaveTermUsageCard({
  usage,
  variant,
}: {
  usage: LeaveTermUsage | null | undefined;
  variant: 'apply' | 'approve';
}) {
  if (!usage) return null;
  const exceeded = usage.exceeded && usage.cap_days != null;
  const noTerm = !usage.term_name;
  const byType = usage.by_type ?? [];
  const subject = variant === 'apply' ? '本学期已累计请假' : '该生本学期累计请假';
  const recentSubject = variant === 'apply' ? '近 30 天我已请' : '近 30 天该生已请';

  return (
    <div
      style={{
        margin: '0 0 12px',
        padding: '10px 12px',
        borderRadius: 8,
        background: exceeded ? '#fff2f0' : 'var(--bg-soft, #fafbfc)',
        border: `1px solid ${exceeded ? '#ffccc7' : 'var(--border, #e6e8eb)'}`,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--fg-2, #4b5563)' }}>
          {noTerm ? '当前不在学期内,' : `${usage.term_name}·`}
          {subject}{' '}
          <b style={{ color: exceeded ? '#cf1322' : 'var(--fg, #111827)' }}>
            {usage.accumulated_days}
          </b>{' '}
          天
          {usage.cap_days != null && (
            <span style={{ color: 'var(--fg-3, #6b7280)' }}>
              {' '}
              / 上限 {usage.cap_days} 天
            </span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        <Tooltip title={`status ∈ {pending, approved} 的近 30 天请假条数,跨学期口径`}>
          <span style={{ color: 'var(--fg-3, #6b7280)', fontSize: 12 }}>
            {recentSubject} <b style={{ color: 'var(--fg-2, #4b5563)' }}>{usage.recent_count_30d}</b> 次
          </span>
        </Tooltip>
      </div>

      {byType.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {byType.map((t) => (
            <Tag key={t.code} style={{ margin: 0, fontWeight: 400 }}>
              {t.name} {t.days} 天
            </Tag>
          ))}
        </div>
      )}

      {exceeded && (
        <div style={{ marginTop: 6, color: '#cf1322', fontSize: 12 }}>
          已超出全校学期上限 {usage.cap_days} 天 — 本次申请仍可提交,但会被自动标记为高风险。
        </div>
      )}
    </div>
  );
}
