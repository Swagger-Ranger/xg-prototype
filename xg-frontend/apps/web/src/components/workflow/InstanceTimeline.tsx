import { useQuery } from '@tanstack/react-query';
import { Spin, Tooltip } from 'antd';
import dayjs from 'dayjs';
import type { TimelineNode, TimelineNodeState } from '@xg1/shared';
import { getInstanceTimeline } from '@/api/workflow';
import styles from './InstanceTimeline.module.css';

interface Props {
  instanceId: string | number | null | undefined;
}

const STATE_DOT_CLASS: Record<TimelineNodeState, string> = {
  completed: styles.dotCompleted,
  in_progress: styles.dotCurrent,
  pending: styles.dotPending,
};

const TYPE_LABEL: Record<string, string> = {
  form_submit: '发起',
  approval: '审批',
  notification: '通知',
  end: '结束',
};

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || ms < 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

function formatDecision(node: TimelineNode): string | null {
  if (node.state !== 'completed') return null;
  if (node.type !== 'approval') return null;
  return node.decision === 'rejected' ? '驳回' : '通过';
}

function actorLabel(node: TimelineNode): string | null {
  if (!node.actor) return null;
  return node.actor.name ?? null;
}

function NodeBlock({ node, isLast }: { node: TimelineNode; isLast: boolean }) {
  const decision = formatDecision(node);
  const actor = actorLabel(node);
  const duration = formatDuration(node.duration_ms);
  const dueText =
    node.state === 'in_progress' && node.due_at
      ? `${dayjs(node.due_at).format('MM-DD HH:mm')} 前`
      : null;

  const tooltipParts: string[] = [];
  if (node.comment) tooltipParts.push(`意见：${node.comment}`);
  if (node.completed_at) tooltipParts.push(`时间：${dayjs(node.completed_at).format('MM-DD HH:mm')}`);
  const tooltip = tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined;

  return (
    <div
      className={`${styles.node} ${node.current_for_viewer ? styles.nodeViewer : ''} ${
        node.state === 'completed' && node.decision === 'rejected' ? styles.nodeRejected : ''
      }`}
    >
      <div className={styles.gutter}>
        <Tooltip title={tooltip} placement="right" mouseEnterDelay={0.3}>
          <div className={`${styles.dot} ${STATE_DOT_CLASS[node.state]}`}>
            {node.current_for_viewer && <span className={styles.viewerArrow}>→</span>}
          </div>
        </Tooltip>
        {!isLast && (
          <div
            className={`${styles.connector} ${
              node.state === 'completed' ? styles.connectorActive : ''
            }`}
          />
        )}
      </div>
      <div className={styles.nodeMeta}>
        <div className={styles.nodeName}>
          <span>{node.name}</span>
          <span className={styles.nodeType}>{TYPE_LABEL[node.type] ?? node.type}</span>
        </div>
        {node.skip_label && <div className={styles.skipLabel}>{node.skip_label}</div>}
        {node.state === 'completed' && (
          <>
            <div className={styles.nodeDetail}>
              {decision && (
                <span className={node.decision === 'rejected' ? styles.decisionReject : styles.decisionApprove}>
                  {decision}
                </span>
              )}
              {actor && <span className={styles.actor}>· {actor}</span>}
              {duration && <span className={styles.muted}>· 用时 {duration}</span>}
            </div>
            {node.comment && (
              <div className={styles.nodeComment} title={node.comment}>
                意见：{node.comment}
              </div>
            )}
          </>
        )}
        {node.state === 'in_progress' && (
          <div className={styles.nodeDetail}>
            {actor && <span className={styles.actor}>{actor}</span>}
            {dueText && <span className={styles.muted}>· {dueText}</span>}
          </div>
        )}
        {node.state === 'pending' && actor == null && (
          <div className={styles.nodeDetailMuted}>未到达</div>
        )}
      </div>
    </div>
  );
}

export default function InstanceTimeline({ instanceId }: Props) {
  const enabled = instanceId != null && instanceId !== '';
  const { data, isLoading, error } = useQuery({
    queryKey: ['wfTimeline', instanceId],
    queryFn: () => getInstanceTimeline(instanceId as string),
    staleTime: 30 * 1000,
    enabled,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spin size="small" /> 加载流程进度…
      </div>
    );
  }
  if (error || !data) {
    return <div className={styles.error}>流程进度加载失败</div>;
  }

  const banner =
    data.status === 'rejected'
      ? '流程已驳回'
      : data.status === 'cancelled'
      ? '流程已撤回'
      : data.status === 'completed'
      ? '流程已完成'
      : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>流程进度</span>
        {banner && (
          <span
            className={`${styles.banner} ${
              data.status === 'rejected'
                ? styles.bannerReject
                : data.status === 'cancelled'
                ? styles.bannerMuted
                : styles.bannerOk
            }`}
          >
            {banner}
          </span>
        )}
      </div>

      <div className={styles.strip}>
        {data.nodes.map((node, idx) => (
          <NodeBlock key={node.id} node={node} isLast={idx === data.nodes.length - 1} />
        ))}
      </div>

      {data.outcome_preview && (data.outcome_preview.on_approve || data.outcome_preview.on_reject) && (
        <ul className={styles.outcomes}>
          {data.outcome_preview.on_approve && (
            <li>
              <span className={styles.outcomeLabel}>▸ 通过</span>
              <span className={styles.outcomeValue}>{data.outcome_preview.on_approve}</span>
            </li>
          )}
          {data.outcome_preview.on_reject && (
            <li>
              <span className={styles.outcomeLabel}>▸ 驳回</span>
              <span className={styles.outcomeValue}>{data.outcome_preview.on_reject}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
