import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Modal, Spin } from 'antd';
import {
  TeamOutlined,
  UserSwitchOutlined,
  AlertOutlined,
  FileTextOutlined,
  WarningOutlined,
  RiseOutlined,
  FallOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCareSummary } from '@/api/care';
import { getWorkspaceMetrics } from '@/api/insight';
import { listMyObserverCards, deleteObserverCard, type ObserverCard as ObserverCardData } from '@/api/aiObserver';
import { useAuth } from '@/hooks/useAuth';
import InsightCard from '@/components/insight/InsightCard';
import ObserverCard from '@/components/observer/ObserverCard';
import ObserverCardDrawer from '@/components/observer/ObserverCardDrawer';
import TodayBriefCard, { type BriefItem } from '@/components/brief/TodayBriefCard';
import { message } from '@/utils/antdApp';
import styles from './index.module.css';

const SPARK_PATTERNS = [
  [5, 7, 6, 9, 7, 10, 12, 14],
  [4, 6, 5, 8, 7, 9, 10, 13],
  [3, 5, 8, 6, 9, 10, 12, 15],
  [6, 5, 7, 9, 11, 10, 13, 15],
];

export default function DeanWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // 院长自配的「观察员卡」 - 默认非空时显示;空也显示一个"+新建"占位提示。
  const { data: observerCards = [] } = useQuery({
    queryKey: ['observerCards', 'mine'],
    queryFn: listMyObserverCards,
    staleTime: 60 * 1000,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ObserverCardData | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteObserverCard(id),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['observerCards', 'mine'] });
    },
  });
  const openNew = () => { setEditingCard(null); setDrawerOpen(true); };
  const openEdit = (c: ObserverCardData) => { setEditingCard(c); setDrawerOpen(true); };
  const confirmDelete = (c: ObserverCardData) => Modal.confirm({
    title: `删除「${c.title}」?`,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: () => deleteMut.mutateAsync(c.id),
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['workspaceMetrics', 'dean'],
    queryFn: () => getWorkspaceMetrics('dean'),
    refetchInterval: 120000,
  });

  const { data: alertSummary } = useQuery({
    queryKey: ['careSummary'],
    queryFn: getCareSummary,
    refetchInterval: 120000,
  });

  // student_alert 已下线，口径统一走 care_task；不再回退旧的 metrics.alerts_open_total。
  const openTotal = Number(alertSummary?.open_total ?? 0);
  const criticalHigh =
    Number(alertSummary?.by_severity?.critical ?? 0) +
    Number(alertSummary?.by_severity?.high ?? 0);

  const cards = [
    {
      label: '在校学生',
      value: metrics?.total_students ?? 0,
      icon: <TeamOutlined />,
      href: '/student',
      footer: '活跃',
      spark: SPARK_PATTERNS[0],
    },
    {
      label: '辅导员',
      value: metrics?.total_counselors ?? 0,
      icon: <UserSwitchOutlined />,
      href: '/system/user',
      footer: '在岗',
      spark: SPARK_PATTERNS[1],
    },
    {
      label: '待审批假',
      value: metrics?.leave_pending ?? 0,
      icon: <FileTextOutlined />,
      href: '/leave?status=pending',
      footer: '全院',
      spark: SPARK_PATTERNS[2],
    },
    {
      label: '未解决关怀',
      value: openTotal,
      icon: <AlertOutlined />,
      href: '/care',
      footer: criticalHigh > 0 ? `紧急 ${criticalHigh}` : '全部正常',
      critical: criticalHigh > 0,
      spark: SPARK_PATTERNS[3],
    },
  ];

  const workload = metrics?.top_counselor_workload ?? [];

  const leavePending = Number(metrics?.leave_pending ?? 0);
  const leaveLast7d = Number(metrics?.leave_submitted_last_7d ?? 0);
  const leavePrev7d = Number(metrics?.leave_submitted_prev_7d ?? 0);
  const violations30d = Number(metrics?.violations_last_30d ?? 0);
  const leaveTrendDelta = leaveLast7d - leavePrev7d;
  const topLoader = workload[0];

  const briefItems: BriefItem[] = [];

  if (leavePending > 0) {
    briefItems.push({
      icon: <FileTextOutlined />,
      tone: leavePending >= 10 ? 'warn' : 'normal',
      segments: [
        { text: '全院待审批请假 ' },
        { value: leavePending, tone: leavePending >= 10 ? 'warn' : 'normal' },
        { text: ' 件' },
      ],
      trail: topLoader ? `最重：${topLoader.name} ${topLoader.pending} 件` : undefined,
    });
  }
  if (leaveLast7d > 0 || leavePrev7d > 0) {
    const up = leaveTrendDelta > 0;
    briefItems.push({
      icon: up ? <RiseOutlined /> : <FallOutlined />,
      tone: up && leaveTrendDelta >= 5 ? 'warn' : 'normal',
      segments: [
        { text: '近 7 天请假 ' },
        { value: leaveLast7d },
        {
          text:
            leavePrev7d > 0
              ? ` 件，${up ? '环比上升 ' : '环比下降 '}`
              : ' 件',
        },
        leavePrev7d > 0
          ? {
              value: `${Math.abs(leaveTrendDelta)}`,
              tone: up && leaveTrendDelta >= 5 ? 'warn' : 'normal',
            }
          : { text: '' },
      ],
    });
  }
  if (openTotal > 0) {
    briefItems.push({
      icon: <AlertOutlined />,
      tone: criticalHigh > 0 ? 'danger' : 'warn',
      href: '/care',
      segments: [
        { text: '未解决关怀 ' },
        { value: openTotal, tone: criticalHigh > 0 ? 'danger' : 'warn' },
        { text: ' 条' },
      ],
      trail: criticalHigh > 0 ? `紧急 ${criticalHigh}` : undefined,
    });
  }
  if (violations30d > 0) {
    briefItems.push({
      icon: <WarningOutlined />,
      tone: 'warn',
      segments: [
        { text: '近 30 天违纪记录 ' },
        { value: violations30d, tone: 'warn' },
        { text: ' 条' },
      ],
    });
  }

  return (
    <div className={styles.workspace}>
      {user?.real_name && <div className={styles.greeting}>你好，{user.real_name}</div>}

      <TodayBriefCard items={briefItems} emptyText="今日全院运转平稳，无紧急事项。" />

      <div className={styles.sectionLabel}>
        <span>全院 KPI</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.statGrid}>
        {cards.map((card) => (
          <div
            key={card.label}
            className={styles.statCard}
            onClick={() => navigate(card.href)}
          >
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{card.label}</span>
              <span className={styles.statIcon}>{card.icon}</span>
            </div>
            <div className={`${styles.statValue} ${card.critical ? styles.statValueCritical : ''}`}>
              {card.value}
            </div>
            <div className={styles.statFooter}>
              <span>{card.footer}</span>
              <div className={styles.spark}>
                {card.spark.map((h, i) => (
                  <span key={i} style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sectionLabel}>
        <span>AI 观察员</span>
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          onClick={openNew}
          style={{ marginLeft: 12 }}
        >
          新建
        </Button>
        <div className={styles.sectionLine} />
      </div>

      {/* 自配卡 - 院长自己用 NL 配出来的可视化卡 */}
      {observerCards.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {observerCards.map((c) => (
            <ObserverCard
              key={c.id}
              card={c}
              onEdit={openEdit}
              onDelete={confirmDelete}
            />
          ))}
        </div>
      ) : (
        <Empty
          description="还没配卡 · 点上面的「新建」用一句话描述你想看的数据"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginBottom: 16, padding: '20px 0' }}
        />
      )}

      {/* 系统预制的洞察(InsightCard)依然保留 — 它是规则驱动的固定项,跟可配卡互补 */}
      <div style={{ marginBottom: 28 }}>
        <InsightCard role="dean" />
      </div>

      <ObserverCardDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ownerRole="dean"
        editing={editingCard}
        onSaved={() => qc.invalidateQueries({ queryKey: ['observerCards', 'mine'] })}
      />

      <div className={styles.sectionLabel}>
        <span>辅导员工作量 TOP</span>
        <div className={styles.sectionLine} />
      </div>
      <div className={styles.todoList}>
        {metricsLoading ? (
          <div className={styles.todoEmpty}><Spin size="small" /></div>
        ) : workload.length === 0 ? (
          <div className={styles.todoEmpty}>暂无数据</div>
        ) : (
          workload.map((row, idx) => (
            <div key={`${row.name}-${idx}`} className={styles.tableRow}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>{row.name}</div>
                <div className={styles.rowSub}>待审批请假 {row.pending} 件</div>
              </div>
              <div className={styles.rowMeta}>#{idx + 1}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
