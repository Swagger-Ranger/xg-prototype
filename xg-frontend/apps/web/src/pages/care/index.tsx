import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Collapse, Spin, Empty, Button, Modal, Space } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import { useAuthStore } from '@/stores/auth.store';
import { listCrisisSignals } from '@/api/crisis';
import {
  listCareTasks,
  acceptCareTask,
  resolveCareTask,
  type CareTaskView,
  type CareStatus,
} from '@/api/care';
import { CareTaskCard } from '@/components/care/CareTaskCard';
import { RescheduleModal } from '@/components/care/RescheduleModal';
import { RejectModal } from '@/components/care/RejectModal';
import { TransferModal } from '@/components/care/TransferModal';
import styles from './index.module.css';

const TODAY_LIMIT = 5;

interface SectionDef {
  key: string;
  title: string;
  statuses: CareStatus[];
  sort: string;
  size: number;
  variant: 'compact' | 'normal';
}

// W1 §2.2 区块定义。本周已完成：后端 CareTaskQueryRequest 无 since 字段，
// 暂按 resolved 最近优先展示（与 W1 §9.2 的 since=monday 设想的偏差，
// 等后端补 since 再收口）。
const SECTIONS: SectionDef[] = [
  { key: 'today', title: '今日待处理', statuses: ['pending'], sort: 'severity_desc,due_asc', size: TODAY_LIMIT, variant: 'compact' },
  { key: 'doing', title: '已接进行中', statuses: ['accepted', 'in_progress'], sort: 'created_desc', size: 20, variant: 'normal' },
  { key: 'done', title: '本周已完成', statuses: ['resolved'], sort: 'created_desc', size: 20, variant: 'normal' },
  { key: 'overdue', title: '超期任务', statuses: ['overdue'], sort: 'due_asc', size: 20, variant: 'normal' },
];

export default function CareWorkbenchPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const realName = useAuthStore((s) => s.user)?.real_name ?? '老师';

  const [rescheduleTask, setRescheduleTask] = useState<CareTaskView | null>(null);
  const [rejectTask, setRejectTask] = useState<CareTaskView | null>(null);
  const [transferTask, setTransferTask] = useState<CareTaskView | null>(null);

  const queries = useQueries({
    queries: SECTIONS.map((s) => ({
      queryKey: ['care.tasks', s.key],
      queryFn: () => listCareTasks({ statuses: s.statuses, sort: s.sort, size: s.size }),
    })),
  });

  // 危机泳道：独立查询，不进 care SECTIONS、不被规则 severity 排序盖过
  // （设计：crisis 与 R001–R012 并行，最高优先级，单独最上方呈现）。
  const crisisQ = useQuery({
    queryKey: ['crisis.list'],
    queryFn: listCrisisSignals,
  });
  const crisisRows = crisisQ.data ?? [];

  const invalidateAll = () => qc.invalidateQueries({ queryKey: ['care.tasks'] });

  const acceptM = useMutation({
    mutationFn: (t: CareTaskView) => acceptCareTask(t.task_id),
    onSuccess: () => {
      message.success('已接单');
      invalidateAll();
    },
    onError: (e) => message.error(describeApiError(e, '接单失败')),
  });

  const resolveM = useMutation({
    mutationFn: (t: CareTaskView) => resolveCareTask(t.task_id),
    onSuccess: () => {
      message.success('已完成');
      invalidateAll();
    },
    onError: (e) => message.error(describeApiError(e, '完成失败')),
  });

  const confirmResolve = (t: CareTaskView) =>
    Modal.confirm({
      title: '确认完成该关怀任务？',
      content: '完成后任务进入终态，不可逆。',
      okText: '确认完成',
      onOk: () => resolveM.mutateAsync(t),
    });

  const todayTotal = queries[0].data?.total ?? 0;

  const cardHandlers = (t: CareTaskView) => ({
    task: t,
    onDetail: (x: CareTaskView) => navigate(`/care/task/${x.task_id}`),
    onAccept: (x: CareTaskView) => acceptM.mutate(x),
    onResolve: confirmResolve,
    onReschedule: setRescheduleTask,
    onReject: setRejectTask,
    onTransfer: setTransferTask,
  });

  const items = SECTIONS.map((s, i) => {
    const q = queries[i];
    const rows = q.data?.data ?? [];
    const total = q.data?.total ?? 0;
    const isOverdue = s.key === 'overdue';
    return {
      key: s.key,
      label: (
        <span>
          {s.title}（
          <span className={isOverdue && total > 0 ? styles.overdueDot : undefined}>{total}</span>）
        </span>
      ),
      children: q.isLoading ? (
        <Spin />
      ) : rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
      ) : (
        <div className={styles.cardList}>
          {rows.map((t) => (
            <CareTaskCard key={t.task_id} variant={s.variant} {...cardHandlers(t)} />
          ))}
        </div>
      ),
    };
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 style={{ margin: 0 }}>关怀工作台</h2>
      </div>
      <div className={styles.greeting}>
        {realName}，您好。今天有 {todayTotal} 件需要关注的事。
      </div>

      {/* 危机泳道：仅有待核实线索时出现，红色置顶、与下方关怀任务强区隔。
          点进去看区一处理必须信息 + 区二辅助判断（设计 §4/§5）。 */}
      {crisisRows.length > 0 && (
        <div
          style={{
            margin: '16px 0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
            background: '#fff2f0',
            padding: '12px 16px',
          }}
        >
          <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 8 }}>
            危机 · 需立即人工核实（{crisisRows.length}）
          </div>
          {crisisRows.map((c) => (
            <div
              key={c.signal_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderTop: '1px solid #ffd8d3',
              }}
            >
              <Space>
                <span style={{ fontWeight: 600 }}>{c.student_name ?? '未知学生'}</span>
                {c.class_name && <span style={{ color: '#6b7280' }}>· {c.class_name}</span>}
                <span style={{ color: '#94a3b8' }}>
                  {new Date(c.created_at).toLocaleString('zh-CN', { hour12: false })}
                </span>
              </Space>
              <Button
                type="primary"
                danger
                size="small"
                onClick={() => navigate(`/crisis/${c.signal_id}`)}
              >
                查看并处理
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 今日待处理默认展开；超期即使有数也不自动展开（W1 §2.2 避免一进首屏焦虑） */}
      <Collapse defaultActiveKey={['today']} items={items} />

      <div className={styles.footer}>
        <Space>
          <span style={{ color: '#94a3b8' }}>UAT 阶段保留：</span>
          <Button type="link" onClick={() => navigate('/alerts')}>
            切回旧视图 →
          </Button>
        </Space>
      </div>

      <RescheduleModal task={rescheduleTask} onClose={() => setRescheduleTask(null)} onSuccess={invalidateAll} />
      <RejectModal task={rejectTask} onClose={() => setRejectTask(null)} onSuccess={invalidateAll} />
      <TransferModal task={transferTask} onClose={() => setTransferTask(null)} onSuccess={invalidateAll} />
    </div>
  );
}
