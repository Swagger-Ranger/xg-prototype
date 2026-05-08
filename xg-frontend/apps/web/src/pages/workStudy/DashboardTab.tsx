import { useMemo, type ReactNode } from 'react';
import { RobotOutlined, BulbOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  listApplications,
  listPositions,
  listSalaries,
  type WorkStudyApplication,
  type WorkStudyPosition,
  type WorkStudySalary,
} from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './DashboardTab.module.css';

const POSITION_STATUS_LABEL: Record<string, string> = {
  draft: '草稿', pending_approval: '审批中', open: '招聘中', closed: '已关闭',
};
// Pie / chart palette pulled from design tokens (--ok / --warn / --ac / --fg-4)
const POSITION_STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8',
  pending_approval: '#b45309',
  open: '#059669',
  closed: '#64748b',
};
const SALARY_STATUS_LABEL: Record<string, string> = {
  draft: '草稿', pending: '审批中', confirmed: '已确认', rejected: '已驳回', paid: '已支付',
};

type AccentTone = 'indigo' | 'cyan' | 'ok' | 'warn' | 'danger' | 'muted';

export default function DashboardTab() {
  const { isStudent, user } = useAuth();
  if (isStudent) return <StudentDashboard userId={user?.id ? String(user.id) : '0'} />;
  return <StaffDashboard />;
}

// ============================================================
// Student dashboard — 4 stat cards + AI tip
// ============================================================

function StudentDashboard({ userId }: { userId: string }) {
  const seedInput = useAIActionStore((s) => s.seedInput);
  const eligibleQ = useQuery({
    queryKey: ['ws-dashboard-student-positions'],
    queryFn: () => listPositions({ page: 1, size: 1, status: 'open', studentScope: true }),
  });
  const myAppsQ = useQuery({
    queryKey: ['ws-dashboard-student-apps', userId],
    queryFn: () => listApplications({ page: 1, size: 100, student_id: userId }),
  });

  const apps = myAppsQ.data?.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, hired: 0, rejected: 0 };
    apps.forEach((a) => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [apps]);

  return (
    <div className={styles.page}>
      <div className={styles.sectionLabel}>
        <span>OVERVIEW</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.statGrid}>
        <StatCard tone="indigo" label="可申请岗位"
          value={eligibleQ.data?.total} loading={eligibleQ.isFetching}
          suffix="个" hint="已按你的资格条件预筛" />
        <StatCard tone="cyan" label="审批中"
          value={counts.pending} loading={myAppsQ.isFetching}
          suffix="份" hint="耐心等待结果" />
        <StatCard tone="ok" label="已录用"
          value={counts.hired} loading={myAppsQ.isFetching}
          suffix="份" hint={counts.hired > 0 ? '记得按时上岗' : '继续投递'} />
        <StatCard tone="muted" label="未通过"
          value={counts.rejected} loading={myAppsQ.isFetching}
          suffix="份" hint={counts.rejected > 0 ? '换个偏好再试' : '保持节奏'} />
      </div>

      <div className={styles.sectionLabel}>
        <span>HOW TO USE</span>
        <div className={styles.sectionLine} />
        <button
          className={styles.sectionAction}
          onClick={() =>
            seedInput('帮我用 workstudy_dashboard_brief 总结一下我现在的勤工助学进度', { send: true })
          }
        >
          <RobotOutlined /> AI 总结
        </button>
      </div>

      <div className={styles.tipCard}>
        <ul className={styles.tipBody}>
          <li>找匹配的岗位？在 AI 面板里说"按我的偏好找岗位"或"按我的空余时间匹配岗位"。</li>
          <li>提交申请前，让 AI 帮你 <em>起草申请理由</em>。</li>
          <li>每学年 <em>固定岗最多 1 个</em>，临时岗可多个；超额申请会被系统拦截。</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// Staff dashboard — KPI + 4 charts
// ============================================================

function StaffDashboard() {
  const seedInput = useAIActionStore((s) => s.seedInput);
  const openQ = useQuery({
    queryKey: ['ws-dashboard-staff-open'],
    queryFn: () => listPositions({ page: 1, size: 1, status: 'open' }),
  });
  const closedQ = useQuery({
    queryKey: ['ws-dashboard-staff-closed'],
    queryFn: () => listPositions({ page: 1, size: 1, status: 'closed' }),
  });
  const pendingAppsQ = useQuery({
    queryKey: ['ws-dashboard-staff-pending-apps'],
    queryFn: () => listApplications({ page: 1, size: 1, status: 'pending' }),
  });
  const pendingSalariesQ = useQuery({
    queryKey: ['ws-dashboard-staff-pending-sal'],
    queryFn: () => listSalaries({ page: 1, size: 1, status: 'pending' }),
  });

  const allPositionsQ = useQuery({
    queryKey: ['ws-dashboard-staff-all-positions'],
    queryFn: () => listPositions({ page: 1, size: 100 }),
  });
  const recentSalariesQ = useQuery({
    queryKey: ['ws-dashboard-staff-recent-salaries'],
    queryFn: () => listSalaries({ page: 1, size: 100 }),
  });
  const pendingAppListQ = useQuery({
    queryKey: ['ws-dashboard-staff-pending-app-list'],
    queryFn: () => listApplications({ page: 1, size: 100, status: 'pending' }),
  });

  const pendingApps = Number(pendingAppsQ.data?.total ?? 0);
  const pendingSal  = Number(pendingSalariesQ.data?.total ?? 0);
  const open        = Number(openQ.data?.total ?? 0);
  const closed      = Number(closedQ.data?.total ?? 0);

  return (
    <div className={styles.page}>
      <div className={styles.sectionLabel}>
        <span>KPI · TODAY</span>
        <div className={styles.sectionLine} />
        <button
          className={styles.sectionAction}
          onClick={() =>
            seedInput('用 workstudy_dashboard_brief 给我播报今天的勤工助学情况', { send: true })
          }
        >
          <RobotOutlined /> AI 播报
        </button>
      </div>

      <div className={styles.statGrid}>
        <StatCard tone="ok" label="在招岗位" value={open}
          loading={openQ.isFetching} suffix="个"
          hint={open === 0 ? '当前无在招岗位' : '查看 / 关闭可在岗位 tab'} />
        <StatCard tone="muted" label="已关闭岗位" value={closed}
          loading={closedQ.isFetching} suffix="个" />
        <StatCard tone="indigo" label="待审批申请" value={pendingApps}
          loading={pendingAppsQ.isFetching} suffix="条"
          hint={pendingApps >= 5 ? '建议批量过' : '正常节奏'} />
        <StatCard tone="warn" label="待审批薪资" value={pendingSal}
          loading={pendingSalariesQ.isFetching} suffix="条"
          hint={pendingSal > 0 ? '先扫异常再批' : '已清空'} />
      </div>

      <div className={styles.sectionLabel}>
        <span>CHARTS</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.chartGrid}>
        <ChartCard title="岗位状态分布" hint="按 status 归类" loading={allPositionsQ.isFetching}>
          <PositionPie positions={allPositionsQ.data?.data ?? []} />
        </ChartCard>
        <ChartCard title="月度薪资支出" hint="按状态堆叠" loading={recentSalariesQ.isFetching}>
          <SalaryByStatusBar salaries={recentSalariesQ.data?.data ?? []} />
        </ChartCard>
        <ChartCard title="用人单位 TOP 8" hint="岗位数排行" loading={allPositionsQ.isFetching}>
          <EmployerBar positions={allPositionsQ.data?.data ?? []} />
        </ChartCard>
        <ChartCard title="待审申请等候时长" hint="累计时长桶" loading={pendingAppListQ.isFetching}>
          <PendingAgeBar applications={pendingAppListQ.data?.data ?? []} />
        </ChartCard>
      </div>

      <div className={styles.sectionLabel}>
        <span>AI · 常用询问</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.tipCard}>
        <div className={styles.tipHead}>
          <span className={styles.tipTitle}><BulbOutlined /> 一键问 AI</span>
        </div>
        <div className={styles.chipsLabel}>点 chip 把问题直接送进 AI 面板：</div>
        <div className={styles.chips}>
          <Chip text="这个月薪资有没有异常？" />
          <Chip text="给岗位 #X 的候选人做对比卡（X 替换为岗位 ID）" />
          <Chip text="按上一学年模板建议新岗位" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Building blocks
// ============================================================

function StatCard({
  tone, label, value, loading, suffix, hint,
}: {
  tone: AccentTone;
  label: string;
  value: number | string | undefined;
  loading?: boolean;
  suffix?: string;
  hint?: string;
}) {
  const n = Number(value ?? 0);
  return (
    <div className={`${styles.statCard} ${styles[tone] || ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValueRow}>
        {loading ? (
          <span className={styles.skeleton} />
        ) : (
          <>
            <span className={styles.statValue}>{n}</span>
            {suffix && <span className={styles.statSuffix}>{suffix}</span>}
          </>
        )}
      </div>
      {hint && <div className={styles.statHint}>{hint}</div>}
    </div>
  );
}

function ChartCard({
  title, hint, loading, children,
}: {
  title: string; hint?: string; loading?: boolean; children: ReactNode;
}) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        {hint && <span className={styles.chartHint}>{hint}</span>}
      </div>
      <div className={styles.chartBox}>
        {loading ? <div className={styles.chartEmpty}>加载中…</div> : children}
      </div>
    </div>
  );
}

function Chip({ text }: { text: string }) {
  const seedInput = useAIActionStore((s) => s.seedInput);
  return (
    <span className={styles.chip} onClick={() => seedInput(text, { send: false })}>
      {text}
    </span>
  );
}

// ============================================================
// Charts (echarts options refactored to design palette)
// ============================================================

const CHART_TEXT_STYLE = { fontFamily: 'inherit', fontSize: 11, color: '#64748b' };

function PositionPie({ positions }: { positions: WorkStudyPosition[] }) {
  if (positions.length === 0) return <div className={styles.chartEmpty}>暂无数据</div>;
  const counts: Record<string, number> = {};
  positions.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
  const data = Object.entries(counts).map(([status, count]) => ({
    name: POSITION_STATUS_LABEL[status] ?? status,
    value: count,
    itemStyle: { color: POSITION_STATUS_COLOR[status] ?? '#94a3b8' },
  }));
  return (
    <ReactECharts
      option={{
        textStyle: CHART_TEXT_STYLE,
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, type: 'scroll', textStyle: CHART_TEXT_STYLE },
        series: [{
          type: 'pie',
          radius: ['46%', '68%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { fontSize: 11, color: '#475569', formatter: '{b}\n{d}%' },
          labelLine: { lineStyle: { color: '#cbd5e1' } },
          data,
        }],
      }}
      style={{ height: 240 }}
      notMerge
    />
  );
}

function SalaryByStatusBar({ salaries }: { salaries: WorkStudySalary[] }) {
  if (salaries.length === 0) return <div className={styles.chartEmpty}>暂无数据</div>;

  const byKey: Record<string, Record<string, number>> = {};
  salaries.forEach((s) => {
    const m = s.month;
    if (!m) return;
    const a = Number(s.amount) || 0;
    if (!byKey[m]) byKey[m] = {};
    byKey[m][s.status] = (byKey[m][s.status] ?? 0) + a;
  });
  const months = Object.keys(byKey).sort();
  const statuses: Array<keyof typeof SALARY_STATUS_LABEL> = ['confirmed', 'paid', 'pending', 'rejected', 'draft'];
  const colors: Record<string, string> = {
    confirmed: '#059669', paid: '#0891b2',
    pending: '#6366f1', rejected: '#dc2626', draft: '#cbd5e1',
  };
  const series = statuses.map((s) => ({
    name: SALARY_STATUS_LABEL[s],
    type: 'bar' as const,
    stack: 'amount',
    barMaxWidth: 28,
    data: months.map((m) => Number((byKey[m]?.[s] ?? 0).toFixed(2))),
    itemStyle: { color: colors[s], borderRadius: [3, 3, 0, 0] },
  }));

  return (
    <ReactECharts
      option={{
        textStyle: CHART_TEXT_STYLE,
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `¥${v.toFixed(2)}` },
        legend: { top: 0, type: 'scroll', textStyle: CHART_TEXT_STYLE, itemHeight: 8, itemGap: 12 },
        grid: { top: 36, left: 56, right: 16, bottom: 24 },
        xAxis: {
          type: 'category', data: months,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisTick: { show: false },
          axisLabel: { color: '#64748b', fontSize: 10.5 },
        },
        yAxis: {
          type: 'value', name: '元',
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b', fontSize: 10.5 },
        },
        series,
      }}
      style={{ height: 240 }}
      notMerge
    />
  );
}

function EmployerBar({ positions }: { positions: WorkStudyPosition[] }) {
  if (positions.length === 0) return <div className={styles.chartEmpty}>暂无数据</div>;

  const counts: Record<string, number> = {};
  positions.forEach((p) => {
    const key = p.employer_id ? `单位 #${p.employer_id}` : (p.department_name || '未填');
    counts[key] = (counts[key] ?? 0) + 1;
  });
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  return (
    <ReactECharts
      option={{
        textStyle: CHART_TEXT_STYLE,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { top: 8, left: 110, right: 30, bottom: 24 },
        xAxis: {
          type: 'value', name: '岗位数',
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b', fontSize: 10.5 },
        },
        yAxis: {
          type: 'category', data: labels.reverse(),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#64748b', fontSize: 11 },
        },
        series: [{
          type: 'bar',
          data: values.reverse(),
          barMaxWidth: 18,
          itemStyle: { color: '#6366f1', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: '#475569', fontSize: 11 },
        }],
      }}
      style={{ height: 240 }}
      notMerge
    />
  );
}

function PendingAgeBar({ applications }: { applications: WorkStudyApplication[] }) {
  if (applications.length === 0) return <div className={styles.chartEmpty}>暂无审批中申请</div>;

  const buckets = ['<24h', '24-72h', '72-168h', '>168h'];
  const counts = [0, 0, 0, 0];
  const now = Date.now();
  applications.forEach((a) => {
    const ts = a.created_at ? Date.parse(a.created_at) : NaN;
    if (Number.isNaN(ts)) return;
    const hours = (now - ts) / (1000 * 60 * 60);
    if (hours < 24) counts[0]++;
    else if (hours < 72) counts[1]++;
    else if (hours < 168) counts[2]++;
    else counts[3]++;
  });
  // greener → redder as the wait grows
  const colors = ['#059669', '#6366f1', '#b45309', '#dc2626'];

  return (
    <ReactECharts
      option={{
        textStyle: CHART_TEXT_STYLE,
        tooltip: { trigger: 'axis' },
        grid: { top: 16, left: 36, right: 24, bottom: 24 },
        xAxis: {
          type: 'category', data: buckets,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisTick: { show: false },
          axisLabel: { color: '#64748b', fontSize: 10.5 },
        },
        yAxis: {
          type: 'value', name: '条数',
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b', fontSize: 10.5 },
        },
        series: [{
          type: 'bar',
          data: counts.map((v, i) => ({
            value: v,
            itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] },
          })),
          label: { show: true, position: 'top', color: '#475569', fontSize: 11 },
          barMaxWidth: 36,
        }],
      }}
      style={{ height: 240 }}
      notMerge
    />
  );
}

// keep for downstream type consumers
export type { WorkStudyApplication };
