import { Card, Col, Row, Statistic, Spin, Empty, Typography, List } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import {
  getCareAdminSummary,
  getCareTrends,
  type CareSeverity,
} from '@/api/care';
import styles from './index.module.css';

const { Title, Text } = Typography;

// 与 SeverityBadge 语义一致（不另起色板）
const SEV_LABEL: Record<CareSeverity, string> = {
  critical: '紧急',
  high: '高',
  medium: '关注',
  low: '提醒',
};
const SEV_COLOR: Record<CareSeverity, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#2563eb',
  low: '#94a3b8',
};

export default function CareDashboardPage() {
  const summaryQ = useQuery({ queryKey: ['care.admin.summary'], queryFn: getCareAdminSummary });
  const trendsQ = useQuery({
    queryKey: ['care.admin.trends'],
    queryFn: () => getCareTrends(),
  });

  const s = summaryQ.data;

  const pieOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b} {c}' },
        data: (s?.severity_dist ?? []).map((d) => ({
          name: SEV_LABEL[d.severity] ?? d.severity,
          value: d.count,
          itemStyle: { color: SEV_COLOR[d.severity] ?? '#94a3b8' },
        })),
      },
    ],
  };

  const trendWeeks = Array.from(
    new Set(
      (trendsQ.data?.series ?? []).flatMap((ser) =>
        ser.points.map((p) => p.week_start),
      ),
    ),
  ).sort();
  const lineOption = {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 40, right: 16, top: 24, bottom: 56 },
    xAxis: {
      type: 'category',
      data: trendWeeks.map((w) => w.slice(0, 10)),
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: (trendsQ.data?.series ?? []).map((ser) => ({
      name: ser.rule,
      type: 'line',
      smooth: true,
      data: trendWeeks.map(
        (w) => ser.points.find((p) => p.week_start === w)?.count ?? 0,
      ),
    })),
  };

  return (
    <div className={styles.page}>
      <Title level={4}>关怀汇总看板</Title>
      <Text type="secondary">本校本周关怀概览（不点名学生 / 辅导员）</Text>

      <Row gutter={16} className={styles.stats}>
        <Col span={6}>
          <Card size="small" loading={summaryQ.isLoading}>
            <Statistic title="本周新增" value={s?.week_total ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" loading={summaryQ.isLoading}>
            <Statistic title="已完成" value={s?.done ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" loading={summaryQ.isLoading}>
            <Statistic title="进行中" value={s?.in_progress ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" loading={summaryQ.isLoading}>
            <Statistic
              title="超期"
              value={s?.overdue ?? 0}
              valueStyle={s?.overdue ? { color: '#dc2626' } : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={10}>
          <Card size="small" title="触发最多规则" className={styles.block}>
            {summaryQ.isLoading ? (
              <Spin />
            ) : s && s.top_rules.length ? (
              <List
                size="small"
                dataSource={s.top_rules}
                renderItem={(r, i) => (
                  <List.Item>
                    <span>
                      <Text type="secondary">{i + 1}. </Text>
                      {r.rule}
                    </span>
                    <Text strong>{r.count}</Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周暂无" />
            )}
          </Card>
        </Col>
        <Col span={14}>
          <Card size="small" title="严重度分布" className={styles.block}>
            {summaryQ.isLoading ? (
              <Spin />
            ) : s && s.severity_dist.length ? (
              <ReactECharts option={pieOption} style={{ height: 240 }} notMerge />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周暂无" />
            )}
          </Card>
        </Col>
      </Row>

      <Card size="small" title="规则趋势（按周）" className={styles.block}>
        {trendsQ.isLoading ? (
          <Spin />
        ) : trendsQ.data && trendsQ.data.series.length ? (
          <ReactECharts option={lineOption} style={{ height: 320 }} notMerge />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
        )}
      </Card>
    </div>
  );
}
