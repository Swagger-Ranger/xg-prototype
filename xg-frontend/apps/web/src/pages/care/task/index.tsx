import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Collapse, Spin, Space, Modal, Descriptions } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  getCareTask,
  getCareBrief,
  refreshCareBrief,
  acceptCareTask,
  resolveCareTask,
  type CareTaskView,
} from '@/api/care';
import { SeverityBadge, StatusBadge } from '@/components/care/SeverityBadge';
import { SlaCountdown } from '@/components/care/SlaCountdown';
import { XiaoxiBrief } from '@/components/care/XiaoxiBrief';
import { RescheduleModal } from '@/components/care/RescheduleModal';
import { RejectModal } from '@/components/care/RejectModal';
import { TransferModal } from '@/components/care/TransferModal';

const TERMINAL = new Set(['resolved', 'rejected', 'transferred']);

const EVIDENCE_LABELS: Record<string, string> = {
  rule_name: '触发规则',
  category: '类别',
  window_days: '回溯窗口（天）',
  matched_count: '命中次数',
  threshold: '阈值',
  distinct_categories: '异常类别数',
  no_talk_days: '无跟进天数',
};

export default function CareTaskDetailPage() {
  const { taskId = '' } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const lazyTried = useRef(false);

  const taskQ = useQuery({
    queryKey: ['care.task', taskId],
    queryFn: () => getCareTask(taskId),
    enabled: !!taskId,
  });
  const briefQ = useQuery({
    queryKey: ['care.brief', taskId],
    queryFn: () => getCareBrief(taskId),
    enabled: !!taskId,
  });

  const refreshM = useMutation({
    mutationFn: () => refreshCareBrief(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care.brief', taskId] }),
    // 限流 / sanitize blocked / sidecar 故障都走这里，message 透传后端中文
    onError: (e) => message.error(describeApiError(e, '分析失败')),
  });

  // W1 §3.4 懒加载：详情打开发现 brief 缺失 → 自动触发一次生成（仅一次）
  useEffect(() => {
    if (briefQ.isFetched && briefQ.data == null && !lazyTried.current && !refreshM.isPending) {
      lazyTried.current = true;
      refreshM.mutate();
    }
  }, [briefQ.isFetched, briefQ.data, refreshM]);

  const invalidateTask = () => qc.invalidateQueries({ queryKey: ['care.task', taskId] });

  const acceptM = useMutation({
    mutationFn: () => acceptCareTask(taskId),
    onSuccess: () => {
      message.success('已接单');
      invalidateTask();
    },
    onError: (e) => message.error(describeApiError(e, '接单失败')),
  });
  const resolveM = useMutation({
    mutationFn: () => resolveCareTask(taskId),
    onSuccess: () => {
      message.success('已完成');
      navigate('/care');
    },
    onError: (e) => message.error(describeApiError(e, '完成失败')),
  });

  if (taskQ.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (taskQ.isError || !taskQ.data) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/care')}>
          返回
        </Button>
        <p style={{ marginTop: 16 }}>任务不存在或无权查看。</p>
      </div>
    );
  }

  const t: CareTaskView = taskQ.data;
  const accepted =
    t.status === 'accepted' || t.status === 'in_progress' || (t.status === 'overdue' && !!t.accepted_at);
  const readOnly = TERMINAL.has(t.status);

  const briefState: 'ready' | 'pending' | 'failed' = briefQ.data?.why
    ? 'ready'
    : refreshM.isPending || briefQ.isFetching
      ? 'pending'
      : lazyTried.current
        ? 'failed'
        : 'pending';

  const evidence = t.trigger_evidence ?? {};

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto', paddingBottom: 88 }}>
      {/* 1. 头部：返回 + 学生 + 严重度 + SLA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/care')} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t.student_name ?? '未知学生'}</span>
          {t.class_name && <span style={{ color: '#6b7280' }}>· {t.class_name}</span>}
        </Space>
        <Space>
          <SeverityBadge severity={t.severity} />
          <StatusBadge status={t.status} />
          <SlaCountdown dueAt={t.due_at} />
        </Space>
      </div>

      {/* 2. 一句话触发摘要 */}
      <div style={{ margin: '20px 0', fontSize: 15 }}>{t.trigger_summary}</div>

      {/* 3. 小夕 AI 助手区（默认展开） */}
      <XiaoxiBrief
        state={briefState}
        brief={briefQ.data ?? null}
        onRefresh={() => refreshM.mutate()}
        refreshing={refreshM.isPending}
      />

      {/* 4 触发证据（默认折叠）/ 5 历史关怀（默认折叠，标题带次数） */}
      <Collapse
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'evidence',
            label: '触发证据',
            children: Object.keys(evidence).length ? (
              <Descriptions column={1} size="small">
                {Object.entries(evidence).map(([k, v]) => (
                  <Descriptions.Item key={k} label={EVIDENCE_LABELS[k] ?? k}>
                    {String(v)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            ) : (
              <span style={{ color: '#94a3b8' }}>无结构化证据</span>
            ),
          },
          {
            key: 'history',
            label: `历史关怀（共 ${t.history_count ?? 0} 次）`,
            children:
              (t.history_count ?? 0) > 0 ? (
                <span style={{ color: '#475569' }}>
                  该同学此前有 {t.history_count} 次已结束的关怀记录。
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>暂无历史关怀记录</span>
              ),
          },
        ]}
      />

      {/* 6. 操作区（粘性底部，按状态切换；AI 区状态不影响这里可用性） */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#fff',
          borderTop: '1px solid var(--ant-color-border, #e5e7eb)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {readOnly ? (
          <span style={{ color: '#94a3b8' }}>该任务已结束，仅供查看。</span>
        ) : (
          <Space>
            {!accepted ? (
              <>
                <Button type="primary" loading={acceptM.isPending} onClick={() => acceptM.mutate()}>
                  接单
                </Button>
                <Button onClick={() => setRescheduleOpen(true)}>改期</Button>
                <Button danger onClick={() => setRejectOpen(true)}>
                  拒绝
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  onClick={() =>
                    Modal.confirm({
                      title: '确认完成该关怀任务？',
                      content: '完成后任务进入终态，不可逆。',
                      okText: '确认完成',
                      onOk: () => resolveM.mutateAsync(),
                    })
                  }
                >
                  完成
                </Button>
                <Button onClick={() => setRescheduleOpen(true)}>改期</Button>
                <Button onClick={() => setTransferOpen(true)}>转介</Button>
              </>
            )}
          </Space>
        )}
      </div>

      <RescheduleModal
        task={rescheduleOpen ? t : null}
        onClose={() => setRescheduleOpen(false)}
        onSuccess={invalidateTask}
      />
      <RejectModal
        task={rejectOpen ? t : null}
        onClose={() => setRejectOpen(false)}
        onSuccess={() => navigate('/care')}
      />
      <TransferModal
        task={transferOpen ? t : null}
        onClose={() => setTransferOpen(false)}
        onSuccess={() => navigate('/care')}
      />
    </div>
  );
}
