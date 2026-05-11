import { Statistic, Table, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';

/**
 * AI 问数 (院长 / 学工部部长) 结果卡。后端返回的结构化数据按 chartType 渲染:
 *  - number  → 单数字 Statistic + 可选 comparison(同比/环比)delta
 *  - bar     → Echarts 横向柱状图(分类对比 / 跨学院 / 假别分布)
 *  - line    → Echarts 折线(时间序列;暂保留接口,P0 leave.count 还没用)
 *  - topN    → Antd Table(Top N 排行,长尾下钻)
 *
 * 不做 chart 状态管理,纯展示;数据有变化通过 props 触发 re-render。
 */

export interface MetricRow {
  value?: number | string;
  label?: string;
  x?: string;
  compare_value?: number | string;
  [k: string]: unknown;
}

export interface MetricResultData {
  metric: string;
  chart_type: 'number' | 'bar' | 'line' | 'topN';
  rows: MetricRow[];
  context?: Record<string, unknown>;
  comparison?: {
    value?: number;
    delta?: number;
    delta_pct?: number | null;
    period?: string;
  } | null;
}

interface Props {
  data: MetricResultData;
}

const METRIC_TITLE: Record<string, string> = {
  'leave.count': '请假总数',
  'leave.pass_rate': '请假通过率',
  'leave.duration_avg': '平均请假时长',
  'leave.review_duration_avg': '平均审批耗时',
  'leave.reject_top_reasons': 'Top 驳回理由',
  'leave.no_return_overdue': '长期未销假',
  'student.frequent_leaver': '高频请假学生',
  'class.leave_density': '班级请假密度',
  'student.term_cumulative_exceed': '学期累计超限',
  'approver.workload': '审批人任务量',
  'approver.slow_top': '审批最慢',
  'alert.count_by_type': '预警分布',
};

export default function MetricResultCard({ data }: Props) {
  const title = METRIC_TITLE[data.metric] ?? data.metric;
  const ctx = data.context ?? {};
  const scopeLabel =
    ctx.scope === 'college'
      ? `${(ctx.college_name as string) ?? ''}(本院)`
      : '全校';
  const periodLabel = (ctx.period as string) ?? '';

  return (
    <div
      style={{
        marginTop: 8,
        padding: '12px 14px',
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--bd-2, #e5e7eb)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{scopeLabel}</Tag>
        {periodLabel && (
          <Tag style={{ margin: 0, fontSize: 11 }}>{periodLabel}</Tag>
        )}
      </div>

      {renderBody(data)}
    </div>
  );
}

function renderBody(data: MetricResultData) {
  switch (data.chart_type) {
    case 'number':
      return <NumberView data={data} />;
    case 'bar':
      return <BarView data={data} />;
    case 'line':
      return <LineView data={data} />;
    case 'topN':
      return <TopNView data={data} />;
    default:
      return (
        <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
          未知图表类型: {data.chart_type}
        </span>
      );
  }
}

function NumberView({ data }: { data: MetricResultData }) {
  const value = (data.rows[0]?.value as number | undefined) ?? 0;
  const cmp = data.comparison;
  const cmpPct = cmp?.delta_pct;
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
      <Statistic value={value} />
      {cmp && (
        <span style={{ color: 'var(--fg-2, #4b5563)', fontSize: 12 }}>
          {cmp.period}: <b>{cmp.value}</b>
          {cmpPct != null && (
            <Tag
              color={cmpPct >= 0 ? 'green' : 'red'}
              style={{ marginLeft: 6, fontSize: 11 }}
            >
              {cmpPct >= 0 ? '+' : ''}
              {cmpPct}%
            </Tag>
          )}
        </span>
      )}
    </div>
  );
}

function BarView({ data }: { data: MetricResultData }) {
  const rows = data.rows;
  const option = {
    grid: { left: 80, right: 16, top: 8, bottom: 24 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: rows.map((r) => (r.label as string) ?? ''),
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => Number(r.value ?? 0)),
        itemStyle: { color: '#1677ff' },
        label: { show: true, position: 'right', fontSize: 11 },
      },
    ],
    tooltip: { trigger: 'axis' },
  };
  const height = Math.max(120, rows.length * 28 + 48);
  return <ReactECharts option={option} style={{ height }} notMerge />;
}

function LineView({ data }: { data: MetricResultData }) {
  const rows = data.rows;
  const option = {
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => (r.x as string) ?? ''),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: rows.map((r) => Number(r.value ?? 0)),
        itemStyle: { color: '#1677ff' },
      },
      ...(rows.some((r) => r.compare_value != null)
        ? [
            {
              type: 'line' as const,
              name: '对比',
              smooth: true,
              data: rows.map((r) => Number(r.compare_value ?? 0)),
              itemStyle: { color: '#94a3b8' },
              lineStyle: { type: 'dashed' as const },
            },
          ]
        : []),
    ],
    tooltip: { trigger: 'axis' },
  };
  return <ReactECharts option={option} style={{ height: 220 }} notMerge />;
}

function TopNView({ data }: { data: MetricResultData }) {
  const cols = [
    { title: '名称', dataIndex: 'label', key: 'label' },
    { title: '数值', dataIndex: 'value', key: 'value', align: 'right' as const },
  ];
  return (
    <Table
      size="small"
      pagination={false}
      rowKey={(r, i) => String((r.label as string) ?? i)}
      columns={cols}
      dataSource={data.rows}
    />
  );
}
