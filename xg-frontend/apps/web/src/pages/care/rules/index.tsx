import { Card, Table, Switch, Segmented, Tag, Space, Spin, Typography, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  listCareRules,
  toggleCareRule,
  setCareSeverityOffset,
  getCareEffectReport,
  type CareRuleItem,
  type CareEffectReportRule,
} from '@/api/care';
import { SeverityBadge } from '@/components/care/SeverityBadge';
import styles from './index.module.css';

const { Title, Text } = Typography;

const OFFSET_OPTIONS = [
  { label: '降一级', value: -1 },
  { label: '默认', value: 0 },
  { label: '升一级', value: 1 },
];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export default function CareRulesPage() {
  const qc = useQueryClient();

  const rulesQuery = useQuery({ queryKey: ['care.rules'], queryFn: listCareRules });
  const reportQuery = useQuery({
    queryKey: ['care.rules.effect'],
    queryFn: getCareEffectReport,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { ruleId: string; enabled: boolean }) =>
      toggleCareRule(v.ruleId, v.enabled),
    onSuccess: () => {
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['care.rules'] });
    },
    onError: (e) => message.error(describeApiError(e, '保存失败')),
  });

  const offsetMut = useMutation({
    mutationFn: (offset: number) => setCareSeverityOffset(offset),
    onSuccess: () => {
      message.success('全局严重度偏移已更新');
      qc.invalidateQueries({ queryKey: ['care.rules'] });
    },
    onError: (e) => message.error(describeApiError(e, '更新失败')),
  });

  const data = rulesQuery.data;

  const ruleCols: ColumnsType<CareRuleItem> = [
    {
      title: '规则',
      dataIndex: 'name',
      render: (name: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" className={styles.code}>
            {r.rule_id}
          </Text>
        </Space>
      ),
    },
    { title: '分类', dataIndex: 'category', width: 96 },
    {
      title: '基础严重度',
      dataIndex: 'severity',
      width: 120,
      render: (s: CareRuleItem['severity']) => <SeverityBadge severity={s} />,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, r) => (
        <Switch
          checked={enabled}
          loading={toggleMut.isPending && toggleMut.variables?.ruleId === r.rule_id}
          onChange={(checked) =>
            toggleMut.mutate({ ruleId: r.rule_id, enabled: checked })
          }
        />
      ),
    },
  ];

  const reportCols: ColumnsType<CareEffectReportRule> = [
    {
      title: '规则',
      dataIndex: 'name',
      render: (name: string, r) => (
        <Space direction="vertical" size={0}>
          <Text>{name}</Text>
          <Text type="secondary" className={styles.code}>
            {r.rule_id}
          </Text>
        </Space>
      ),
    },
    { title: '触发数', dataIndex: 'triggered', width: 84 },
    { title: '接单率', dataIndex: 'accept_rate', width: 84, render: pct },
    { title: '完成率', dataIndex: 'resolve_rate', width: 84, render: pct },
    {
      title: '平均闭环',
      dataIndex: 'avg_close_hours',
      width: 96,
      render: (h: number, r) => (r.triggered ? `${h.toFixed(1)}h` : '—'),
    },
    {
      title: '误报率',
      dataIndex: 'false_positive_rate',
      width: 84,
      render: pct,
    },
    {
      title: '拒绝原因分布',
      dataIndex: 'reject_reasons',
      render: (rs: CareEffectReportRule['reject_reasons']) =>
        rs.length ? (
          <Space size={4} wrap>
            {rs.map((x) => (
              <Tag key={x.code}>
                {x.label} · {x.count}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '治理提示',
      dataIndex: 'hints',
      render: (hints: string[]) =>
        hints.length ? (
          <Space direction="vertical" size={2}>
            {hints.map((h) => (
              <Tag color="warning" key={h}>
                {h}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <div className={styles.page}>
      <Title level={4}>关怀规则运维</Title>

      <Card
        size="small"
        className={styles.metaCard}
        loading={rulesQuery.isLoading}
      >
        {data && (
          <Space size="large" wrap>
            <span>
              规则集版本：<Text strong>{data.rule_version}</Text>
            </span>
            <span>
              下次预计更新：<Text strong>{data.next_update}</Text>
            </span>
            <span className={styles.offset}>
              <Tooltip title="P1 学校侧只能整体上/下移一级，不能改单规则阈值或 DSL">
                全局严重度偏移：
              </Tooltip>
              <Segmented
                options={OFFSET_OPTIONS}
                value={data.severity_offset}
                disabled={offsetMut.isPending}
                onChange={(v) => offsetMut.mutate(v as number)}
              />
            </span>
          </Space>
        )}
      </Card>

      <Card size="small" title="内置规则" className={styles.block}>
        <Table
          rowKey="rule_id"
          size="small"
          loading={rulesQuery.isLoading}
          dataSource={data?.rules ?? []}
          columns={ruleCols}
          pagination={false}
        />
      </Card>

      <Card
        size="small"
        title={`效果报表（近 ${reportQuery.data?.window_days ?? 30} 天）`}
        className={styles.block}
      >
        {reportQuery.isLoading ? (
          <div className={styles.center}>
            <Spin />
          </div>
        ) : (
          <Table
            rowKey="rule_id"
            size="small"
            dataSource={reportQuery.data?.rules ?? []}
            columns={reportCols}
            pagination={false}
          />
        )}
      </Card>
    </div>
  );
}
