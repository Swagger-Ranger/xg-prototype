import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import {
  TeamOutlined,
  UserSwitchOutlined,
  AlertOutlined,
  FileTextOutlined,
  WarningOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getAlertSummary } from '@/api/alert';
import { getWorkspaceMetrics } from '@/api/insight';
import { useAuth } from '@/hooks/useAuth';
import InsightCard from '@/components/insight/InsightCard';
import TodayBriefCard, { type BriefItem } from '@/components/brief/TodayBriefCard';
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

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['workspaceMetrics', 'dean'],
    queryFn: () => getWorkspaceMetrics('dean'),
    refetchInterval: 120000,
  });

  const { data: alertSummary } = useQuery({
    queryKey: ['alertSummary'],
    queryFn: getAlertSummary,
    refetchInterval: 120000,
  });

  const openTotal =
    Number(alertSummary?.open_total ?? 0) || Number(metrics?.alerts_open_total ?? 0);
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
      label: '未解决预警',
      value: openTotal,
      icon: <AlertOutlined />,
      href: '/alerts',
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
      href: '/alerts',
      segments: [
        { text: '未解决预警 ' },
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
        <div className={styles.sectionLine} />
      </div>
      <div style={{ marginBottom: 28 }}>
        <InsightCard role="dean" />
      </div>

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
