import { useMemo } from 'react';
import { Empty, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { getStudentInsight, type StudentInsight } from '@/api/studentInsight';
import styles from '../../pages/student/profile.module.css';

const METRIC_KEYS = ['violations', 'open_alerts', 'leave_days', 'late_absent', 'talks'] as const;
const METRIC_LABELS: Record<(typeof METRIC_KEYS)[number], string> = {
  violations: '违纪',
  open_alerts: '未闭环预警',
  leave_days: '请假天数',
  late_absent: '迟到/缺勤',
  talks: '谈话次数',
};

function radarOption(insight: StudentInsight) {
  const { self, class_avg, class_max } = insight.peer;
  const indicator = METRIC_KEYS.map((k) => ({
    name: METRIC_LABELS[k],
    max: Math.max(1, class_max[k], self[k]) * 1.15,
  }));
  const selfData = METRIC_KEYS.map((k) => self[k]);
  const avgData = METRIC_KEYS.map((k) => class_avg[k]);

  return {
    tooltip: { trigger: 'item' },
    legend: {
      data: ['本人', '班级均值'],
      right: 10,
      top: 4,
      textStyle: { fontSize: 11 },
    },
    radar: {
      indicator,
      radius: '62%',
      splitNumber: 4,
      axisName: { fontSize: 11, color: '#666' },
      splitArea: { areaStyle: { color: ['rgba(99,102,241,0.02)', 'rgba(99,102,241,0.05)'] } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: selfData,
            name: '本人',
            areaStyle: { color: 'rgba(239,68,68,0.22)' },
            lineStyle: { color: '#ef4444', width: 2 },
            itemStyle: { color: '#ef4444' },
          },
          {
            value: avgData,
            name: '班级均值',
            areaStyle: { color: 'rgba(99,102,241,0.16)' },
            lineStyle: { color: '#6366f1', width: 2 },
            itemStyle: { color: '#6366f1' },
          },
        ],
      },
    ],
  };
}

function trendOption(insight: StudentInsight) {
  const months = insight.trend.map((t) => t.month);
  const series = [
    { name: '高危事件', key: 'high_events', color: '#ef4444' },
    { name: '中低危事件', key: 'mid_low_events', color: '#f59e0b' },
    { name: '预警', key: 'alerts', color: '#8b5cf6' },
    { name: '谈话', key: 'talks', color: '#10b981' },
  ];
  return {
    tooltip: { trigger: 'axis' },
    legend: { right: 10, top: 4, textStyle: { fontSize: 11 } },
    grid: { left: 40, right: 20, top: 40, bottom: 28 },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { fontSize: 11 },
      axisLine: { lineStyle: { color: '#d9d9d9' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 11 },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data: insight.trend.map((t) => (t as any)[s.key] as number),
      itemStyle: { color: s.color },
      lineStyle: { color: s.color, width: 2 },
    })),
  };
}

function buildSummary(insight: StudentInsight): string {
  const { self, class_avg, percentile } = insight.peer;
  const high: string[] = [];
  for (const k of METRIC_KEYS) {
    if (percentile[k] >= 80 && self[k] > 0) {
      high.push(`${METRIC_LABELS[k]}（${self[k]} · 班级前 ${(100 - percentile[k]).toFixed(0)}%）`);
    }
  }

  const recent = insight.trend.slice(-3);
  const prior = insight.trend.slice(0, 3);
  const sum = (arr: typeof insight.trend, key: keyof (typeof insight.trend)[number]) =>
    arr.reduce((acc, r) => acc + ((r[key] as number) || 0), 0);
  const recentEv = sum(recent, 'high_events') + sum(recent, 'mid_low_events');
  const priorEv = sum(prior, 'high_events') + sum(prior, 'mid_low_events');
  const delta = recentEv - priorEv;

  const parts: string[] = [];
  if (high.length === 0) {
    parts.push(`同班 ${insight.peer.peer_count} 人对比，该生各维度处于班级平均水平附近。`);
  } else {
    parts.push(`对比同班 ${insight.peer.peer_count} 人，该生在 ${high.join('、')} 上高于班级多数同学。`);
  }
  if (delta > 0) parts.push(`近 3 个月事件数（${recentEv}）相比前 3 个月（${priorEv}）上升 ${delta}，建议关注。`);
  else if (delta < 0) parts.push(`近 3 个月事件数（${recentEv}）相比前 3 个月（${priorEv}）下降 ${-delta}，整体趋稳。`);
  else if (recentEv > 0) parts.push(`近 3 个月事件数与前 3 个月持平（${recentEv} 条）。`);

  const avgTalks = class_avg.talks;
  if (self.talks < avgTalks && avgTalks >= 1) {
    parts.push(`近 90 天谈话 ${self.talks} 次，低于班级均值（${avgTalks.toFixed(1)}），可考虑主动约谈。`);
  }
  return parts.join(' ');
}

export default function InsightPanel({ profileId }: { profileId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['studentInsight', profileId],
    queryFn: () => getStudentInsight(profileId),
    enabled: !!profileId,
  });

  const summary = useMemo(() => (data ? buildSummary(data) : ''), [data]);

  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <Spin />
      </div>
    );
  }
  if (isError || !data) {
    return <Empty description="暂无洞察数据" />;
  }

  return (
    <>
      <div className={styles.insightGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>同伴对比（近 90 天）</div>
          <div className={styles.chartSub}>
            范围：{data.peer.scope} · 同班 {data.peer.peer_count} 人
          </div>
          <ReactECharts option={radarOption(data)} style={{ height: 300 }} notMerge />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>6 个月趋势</div>
          <div className={styles.chartSub}>事件 / 预警 / 谈话 月度计数</div>
          <ReactECharts option={trendOption(data)} style={{ height: 300 }} notMerge />
        </div>
      </div>
      <div className={styles.insightSummary}>
        <strong>AI 洞察：</strong>
        {summary}
      </div>
    </>
  );
}
