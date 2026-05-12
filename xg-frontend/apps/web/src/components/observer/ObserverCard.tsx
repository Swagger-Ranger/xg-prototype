import { useMemo } from 'react';
import { Alert, Card, Dropdown, Empty, Spin, Statistic, Table, Tag, Tooltip } from 'antd';
import { MoreOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { runObserverCard, type ObserverCard as Card_, type ChartType } from '@/api/aiObserver';

interface Props {
  card: Card_;
  onEdit: (c: Card_) => void;
  onDelete: (c: Card_) => void;
}

/**
 * Workspace AI 观察员区里的一张卡。每张卡:
 *   - useQuery 拉数据,staleTime = card.refresh_sec * 1000
 *   - 按 chart_type 派发到 Statistic / Echarts(bar/line/pie/trend) / Table
 *   - 性能 warning 出现在卡顶
 *   - ⋮ 菜单:编辑 / 删除 / 强制刷新
 */
export default function ObserverCard({ card, onEdit, onDelete }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['observerCard', card.id, card.updated_at],
    queryFn: () => runObserverCard(card.id),
    staleTime: card.refresh_sec * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = data?.rows ?? [];
  const warnings = data?.warnings ?? [];

  return (
    <Card
      size="small"
      style={{ borderRadius: 8 }}
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {card.title}
          {(card.cost_estimate ?? 0) > 5000 && (
            <Tooltip title={`本卡 EXPLAIN cost ≈ ${card.cost_estimate},响应可能较慢`}>
              <Tag color="gold" style={{ marginLeft: 8, fontWeight: 400 }}>较重</Tag>
            </Tooltip>
          )}
        </span>
      }
      extra={
        <Dropdown
          menu={{
            items: [
              { key: 'refresh', icon: <ReloadOutlined />, label: '刷新', onClick: () => refetch() },
              { key: 'edit', label: '编辑', onClick: () => onEdit(card) },
              { type: 'divider' },
              { key: 'delete', label: '删除', danger: true, onClick: () => onDelete(card) },
            ],
          }}
          trigger={['click']}
        >
          <MoreOutlined style={{ cursor: 'pointer' }} />
        </Dropdown>
      }
    >
      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={warnings.join(' · ')}
          style={{ marginBottom: 12, padding: '4px 10px', fontSize: 12 }}
        />
      )}
      {isLoading || isFetching ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : isError ? (
        <Alert
          type="error"
          message="加载失败"
          description="检查 SQL 是否仍然有效;若数据结构变化导致跑不出,请重新生成卡。"
        />
      ) : rows.length === 0 ? (
        <Empty description="暂无数据" />
      ) : (
        renderByType(card.chart_type, rows)
      )}
    </Card>
  );
}

function renderByType(type: ChartType, rows: Array<Record<string, unknown>>) {
  switch (type) {
    case 'statistic':
      return <StatisticView rows={rows} />;
    case 'table':
      return <TableView rows={rows} />;
    case 'bar':
    case 'line':
    case 'pie':
    case 'trend':
      return <EChartView rows={rows} type={type} />;
    default:
      return <Empty description={`未知图表类型 ${type}`} />;
  }
}

/* ===== Statistic:取第一行第一个数值列 ===== */
function StatisticView({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <Empty description="无数据" />;
  const first = rows[0];
  const numericEntries = Object.entries(first).filter(([, v]) => typeof v === 'number');
  if (numericEntries.length === 0) {
    const [k, v] = Object.entries(first)[0] ?? ['', ''];
    return <Statistic title={k} value={String(v ?? '-')} />;
  }
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {numericEntries.slice(0, 4).map(([k, v]) => (
        <Statistic key={k} title={k} value={v as number} precision={String(v).includes('.') ? 2 : 0} />
      ))}
    </div>
  );
}

/* ===== Table ===== */
function TableView({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = useMemo(
    () => Object.keys(rows[0] ?? {}).map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true })),
    [rows],
  );
  return (
    <Table
      size="small"
      dataSource={rows}
      columns={columns}
      rowKey={(_, idx) => String(idx)}
      pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
      scroll={{ x: 'max-content' }}
    />
  );
}

/* ===== Echarts bar / line / pie / trend ===== */
function EChartView({ rows, type }: { rows: Array<Record<string, unknown>>; type: ChartType }) {
  const option = useMemo(() => buildChartOption(type, rows), [type, rows]);
  const height = type === 'trend' ? 80 : 240;
  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
}

function buildChartOption(type: ChartType, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  if (rows.length === 0) return {};
  const keys = Object.keys(rows[0]);
  // 启发式取 x / y:第一列字符串/日期当 x,第一个数值列当 y
  const numericKey =
    keys.find((k) => typeof rows[0][k] === 'number') ?? keys[1] ?? keys[0];
  const xKey = keys.find((k) => k !== numericKey) ?? keys[0];

  if (type === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['38%', '64%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: rows.map((r) => ({ name: String(r[xKey]), value: Number(r[numericKey]) || 0 })),
        },
      ],
    };
  }

  const xValues = rows.map((r) => String(r[xKey]));
  const yValues = rows.map((r) => Number(r[numericKey]) || 0);

  if (type === 'trend') {
    return {
      grid: { left: 4, right: 4, top: 4, bottom: 4 },
      xAxis: { type: 'category', show: false, data: xValues, boundaryGap: false },
      yAxis: { type: 'value', show: false },
      tooltip: { trigger: 'axis' },
      series: [{ type: 'line', smooth: true, areaStyle: {}, data: yValues, symbol: 'none' }],
    };
  }

  return {
    grid: { left: 36, right: 12, top: 24, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: xValues, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
    series: [
      {
        type: type === 'bar' ? 'bar' : 'line',
        data: yValues,
        smooth: type === 'line',
        itemStyle: { borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0 },
      },
    ],
  };
}
