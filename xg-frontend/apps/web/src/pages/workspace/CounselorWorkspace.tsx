import { useMemo, useState, type ReactNode } from 'react';
import { Drawer } from 'antd';
import {
  ClockCircleOutlined,
  FileTextOutlined,
  BellOutlined,
  AlertOutlined,
  CoffeeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '@/api/notification';
import { getPendingTasks } from '@/api/workflow';
import { getClassLeaves } from '@/api/leave';
import { getAlertSummary } from '@/api/alert';
import { getClassRoster } from '@/api/counselor';
import { useAuth } from '@/hooks/useAuth';
import InsightCard from '@/components/insight/InsightCard';
import TodayBriefCard, { type BriefItem, type BriefStat, type ClassBrief } from '@/components/brief/TodayBriefCard';
import AskMetricsChips from '@/components/ai/AskMetricsChips';
import styles from './index.module.css';

const SPARK_PATTERNS = [
  [5, 7, 6, 9, 7, 10, 12, 14],
  [4, 6, 5, 8, 7, 9, 10, 13],
  [3, 5, 8, 6, 9, 10, 12, 15],
  [6, 5, 7, 9, 11, 10, 13, 15],
];

interface SummaryArgs {
  pendingCount: number;
  todayLeaveCount: number;
  openAlertTotal: number;
  criticalHighTotal: number;
  unreadCount: number;
  name?: string;
}

function buildCounselorSummary(a: SummaryArgs) {
  const { pendingCount, todayLeaveCount, openAlertTotal, criticalHighTotal, unreadCount, name } = a;

  const parts: ReactNode[] = [];
  const total = pendingCount + openAlertTotal + unreadCount;

  const opener = name ? `${name}老师，` : '';

  if (total === 0 && todayLeaveCount === 0) {
    return (
      <>
        {opener}今日班级整体平稳，<em className="success">无待办、无预警、无未读</em>。
        可以把节奏放在主动走访与学生关怀上，不必切到救火模式。
      </>
    );
  }

  const focus: ReactNode[] = [];
  if (criticalHighTotal > 0) {
    focus.push(
      <>
        其中 <em className="danger">{criticalHighTotal}</em> 位已升到紧急级别，建议最先处理
      </>
    );
  } else if (pendingCount >= 5) {
    focus.push(
      <>
        审批积压到 <em className="warn">{pendingCount}</em> 条，建议今天集中清理一轮
      </>
    );
  } else if (openAlertTotal > 0) {
    focus.push(<>预警暂无紧急项，但仍建议逐条查看后标注处理</>);
  }

  const chips: ReactNode[] = [];
  if (pendingCount > 0)
    chips.push(
      <>
        待审 <em>{pendingCount}</em> 条
      </>
    );
  if (todayLeaveCount > 0)
    chips.push(
      <>
        今日 <em>{todayLeaveCount}</em> 人不在校
      </>
    );
  if (openAlertTotal > 0)
    chips.push(
      <>
        <em className={criticalHighTotal > 0 ? 'danger' : 'warn'}>{openAlertTotal}</em> 位学生触发预警
      </>
    );
  if (unreadCount > 0)
    chips.push(
      <>
        未读通知 <em>{unreadCount}</em> 条
      </>
    );

  parts.push(opener);
  parts.push('今日关注：');
  chips.forEach((c, i) => {
    if (i > 0) parts.push('、');
    parts.push(c);
  });
  parts.push('。');
  if (focus.length > 0) {
    focus.forEach((f) => parts.push(f));
    parts.push('。');
  }

  return <>{parts.map((p, i) => <span key={i}>{p}</span>)}</>;
}

export default function CounselorWorkspace() {
  const { user, hasRole } = useAuth();
  const isDirector = hasRole('student_affairs_director') || hasRole('super_admin');

  const { data: pendingTasks } = useQuery({
    queryKey: ['pendingTasks', { page: 1, size: 5, assigneeId: user?.id }],
    queryFn: () => getPendingTasks({ page: 1, size: 5, assigneeId: user?.id }),
  });

  const { data: classLeaves } = useQuery({
    queryKey: ['classLeaves', { page: 1, size: 20, status: 'pending' }],
    queryFn: () => getClassLeaves({ page: 1, size: 20, status: 'pending' }),
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const { data: alertSummary } = useQuery({
    queryKey: ['alertSummary'],
    queryFn: getAlertSummary,
    refetchInterval: 120000,
  });

  // "不在校" = 已批准、销假未完成、今日或明日在请假区间内的学生。
  // 后端 classLeaves 按 createdAt 倒序，客户端按时间窗过滤近 50 条足够班级规模使用。
  const { data: approvedLeavesWide } = useQuery({
    queryKey: ['classLeaves', { page: 1, size: 50, status: 'approved' }],
    queryFn: () => getClassLeaves({ page: 1, size: 50, status: 'approved' }),
  });

  const { data: roster = [] } = useQuery({
    queryKey: ['classRoster'],
    queryFn: getClassRoster,
    staleTime: 5 * 60 * 1000,
  });

  const studentClassMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster) m.set(String(r.user_id), r.class_name ?? '');
    return m;
  }, [roster]);

  const today = dayjs().format('YYYY-MM-DD');
  const todayStart = dayjs().startOf('day');
  const tomorrowEnd = dayjs().add(1, 'day').endOf('day');
  const onLeaveNow = (approvedLeavesWide?.data ?? []).filter((l) => {
    const start = dayjs(l.start_time);
    const end = dayjs(l.end_time);
    return start.isBefore(tomorrowEnd) && end.isAfter(todayStart);
  });

  const classBreakdown = useMemo<ClassBrief[]>(() => {
    type Row = {
      classId: number | null;
      total: number;
      onLeave: number;
      absentees: Array<{ name: string; days: number }>;
    };
    const map = new Map<string, Row>();
    const ensure = (cn: string, classId: number | null): Row => {
      const row = map.get(cn) ?? { classId, total: 0, onLeave: 0, absentees: [] };
      if (row.classId == null && classId != null) row.classId = classId;
      map.set(cn, row);
      return row;
    };
    for (const r of roster) ensure(r.class_name ?? '未分班', r.class_id ?? null).total += 1;
    for (const l of onLeaveNow) {
      const row = ensure(studentClassMap.get(String(l.student_id)) || '未分班', null);
      row.onLeave += 1;
      row.absentees.push({ name: l.student_name, days: l.duration_days });
    }
    return Array.from(map.entries()).map(([className, v]) => ({ className, ...v }));
  }, [roster, onLeaveNow, studentClassMap]);
  const [classInsight, setClassInsight] = useState<{ classId: number; className: string } | null>(null);
  const todayLeaveCount =
    classLeaves?.data.filter((l) => dayjs(l.start_time).format('YYYY-MM-DD') === today).length ?? 0;

  const openAlertTotal = Number(alertSummary?.open_total ?? 0);
  const criticalHighTotal =
    Number(alertSummary?.by_severity?.critical ?? 0) +
    Number(alertSummary?.by_severity?.high ?? 0);

  const pendingCount = Number(pendingTasks?.total ?? 0);

  const briefStats: BriefStat[] = [
    {
      label: '待审批',
      value: pendingCount,
      icon: <ClockCircleOutlined />,
      href: '/leave?status=pending',
      footer: pendingCount > 0 ? '审批中' : '已清空',
      spark: SPARK_PATTERNS[0],
    },
    {
      label: '今日请假',
      value: todayLeaveCount,
      icon: <FileTextOutlined />,
      href: '/leave?status=approved',
      footer: todayLeaveCount > 0 ? `${today}` : '无人离校',
      spark: SPARK_PATTERNS[1],
    },
    {
      label: '未读通知',
      value: unreadCount,
      icon: <BellOutlined />,
      href: '/notification',
      footer: unreadCount > 0 ? '待查看' : '已读完',
      spark: SPARK_PATTERNS[2],
    },
    {
      label: '需关注学生',
      value: openAlertTotal,
      icon: <AlertOutlined />,
      href: '/alerts',
      footer: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : '全部正常',
      critical: criticalHighTotal > 0,
      spark: SPARK_PATTERNS[3],
    },
  ];

  const summary = buildCounselorSummary({
    pendingCount,
    todayLeaveCount,
    openAlertTotal,
    criticalHighTotal,
    unreadCount,
    name: user?.real_name,
  });

  const briefItems: BriefItem[] = [];

  if (pendingCount > 0) {
    briefItems.push({
      icon: <ClockCircleOutlined />,
      tone: pendingCount >= 5 ? 'warn' : 'normal',
      segments: [
        { text: '您有 ' },
        { value: pendingCount, tone: pendingCount >= 5 ? 'warn' : 'normal' },
        { text: ' 件审批待处理' },
      ],
      trail: pendingCount >= 5 ? '下方可直接处理' : undefined,
    });
  }
  if (todayLeaveCount > 0) {
    briefItems.push({
      icon: <CoffeeOutlined />,
      segments: [
        { text: '班级今日共 ' },
        { value: todayLeaveCount },
        { text: ' 人在请假中' },
      ],
    });
  }
  if (openAlertTotal > 0) {
    briefItems.push({
      icon: <AlertOutlined />,
      tone: criticalHighTotal > 0 ? 'danger' : 'warn',
      href: '/alerts',
      segments: [
        { text: '' },
        { value: openAlertTotal, tone: criticalHighTotal > 0 ? 'danger' : 'warn' },
        { text: ' 位学生触发预警' },
      ],
      trail: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : undefined,
    });
  }
  if (unreadCount > 0) {
    briefItems.push({
      icon: <BellOutlined />,
      href: '/notification',
      segments: [
        { text: '未读通知 ' },
        { value: unreadCount },
        { text: ' 条' },
      ],
    });
  }

  return (
    <div className={styles.workspace}>
      {user?.real_name && <div className={styles.greeting}>你好，{user.real_name}</div>}

      <TodayBriefCard
        summary={summary}
        stats={briefStats}
        classes={classBreakdown}
        onClassAi={(c) => c.classId != null && setClassInsight({ classId: c.classId, className: c.className })}
        items={briefItems}
        emptyText="今日班级平稳，暂无需立刻处理的事项，可利用空档做主动关怀。"
      />

      {isDirector && <AskMetricsChips scope="school" />}

      <div className={styles.sectionLabel}>
        <span>AI 观察员</span>
        <div className={styles.sectionLine} />
      </div>
      <div style={{ marginBottom: 28 }}>
        <InsightCard role="counselor" />
      </div>

      <Drawer
        title={classInsight ? `${classInsight.className} · AI 观察员` : 'AI 观察员'}
        open={classInsight != null}
        onClose={() => setClassInsight(null)}
        width={520}
        destroyOnClose
      >
        {classInsight && (
          <InsightCard
            role="counselor"
            classId={classInsight.classId}
            title={`${classInsight.className} · AI 观察员`}
          />
        )}
      </Drawer>
    </div>
  );
}
