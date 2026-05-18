import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import type { CareTaskView } from '@/api/care';
import { SeverityBadge, StatusBadge } from './SeverityBadge';
import { SlaCountdown } from './SlaCountdown';

/**
 * 任务卡（W1 §4）。两形态：
 * - compact：工作台"今日待处理"，显示小夕摘要 1 行，操作按钮固定可见
 * - normal：折叠区展开，显示状态徽章，不显示小夕摘要
 *
 * 卡片只发语义意图，弹窗由页面持有（W1 §4.4 最多 3 个按钮：
 * 主操作实心 + 次操作"更多"下拉 + 详情文字链）。
 */
export interface CareTaskCardProps {
  task: CareTaskView;
  variant: 'compact' | 'normal';
  onDetail: (t: CareTaskView) => void;
  onAccept: (t: CareTaskView) => void;
  onResolve: (t: CareTaskView) => void;
  onReschedule: (t: CareTaskView) => void;
  onReject: (t: CareTaskView) => void;
  onTransfer: (t: CareTaskView) => void;
}

const TERMINAL = new Set(['resolved', 'rejected', 'transferred']);

export function CareTaskCard(props: CareTaskCardProps) {
  const { task, variant, onDetail, onAccept, onResolve, onReschedule, onReject, onTransfer } = props;
  const accepted = task.status === 'accepted' || task.status === 'in_progress'
    || (task.status === 'overdue' && !!task.accepted_at);
  const readOnly = TERMINAL.has(task.status);

  // W1 §4.4 主/次操作按状态切换
  let primary: { label: string; onClick: () => void } | null = null;
  const moreItems: MenuProps['items'] = [];
  if (!readOnly) {
    if (!accepted) {
      primary = { label: '接单', onClick: () => onAccept(task) };
      moreItems.push(
        { key: 'reschedule', label: '改期' },
        { key: 'reject', label: '拒绝' },
      );
    } else {
      primary = { label: '完成', onClick: () => onResolve(task) };
      moreItems.push(
        { key: 'reschedule', label: '改期' },
        { key: 'transfer', label: '转介' },
      );
    }
  }
  const onMore: MenuProps['onClick'] = ({ key }) => {
    if (key === 'reschedule') onReschedule(task);
    else if (key === 'reject') onReject(task);
    else if (key === 'transfer') onTransfer(task);
  };

  return (
    <div
      style={{
        border: '1px solid var(--ant-color-border, #e5e7eb)',
        borderRadius: 8,
        padding: '12px 16px',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SeverityBadge severity={task.severity} />
        {variant === 'normal' && <StatusBadge status={task.status} />}
        <span style={{ fontWeight: 600 }}>{task.student_name ?? '未知学生'}</span>
        {task.class_name && <span style={{ color: '#6b7280' }}>· {task.class_name}</span>}
        <span style={{ color: '#6b7280' }}>· {task.trigger_summary}</span>
      </div>

      {variant === 'compact' && task.brief_summary && (
        <div
          style={{
            color: '#475569',
            margin: '8px 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          小夕：{task.brief_summary}
        </div>
      )}
      {variant === 'compact' && !task.brief_summary && (
        <div style={{ color: '#94a3b8', margin: '8px 0' }}>小夕正在准备…</div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
        }}
      >
        <SlaCountdown dueAt={task.due_at} />
        <Space>
          {primary && (
            <Button type="primary" size="small" onClick={primary.onClick}>
              {primary.label}
            </Button>
          )}
          {moreItems.length > 0 && (
            <Dropdown menu={{ items: moreItems, onClick: onMore }}>
              <Button size="small">更多</Button>
            </Dropdown>
          )}
          <Button type="link" size="small" onClick={() => onDetail(task)}>
            详情
          </Button>
        </Space>
      </div>
    </div>
  );
}
