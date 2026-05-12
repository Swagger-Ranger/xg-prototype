import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Radio,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { message } from '@/utils/antdApp';
import { ThunderboltOutlined, BulbOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import {
  proposeObserverCard,
  previewObserverSql,
  createObserverCard,
  updateObserverCard,
  type ChartSuggestion,
  type ChartType,
  type ObserverCard,
  type GuardWarning,
} from '@/api/aiObserver';
import { describeApiError } from '@/utils/api-error';

const { Paragraph, Text } = Typography;

const CHART_LABEL: Record<ChartType, string> = {
  statistic: '数值',
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  table: '表格',
  trend: '趋势迷你图',
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前用户角色,传给 sidecar 让 LLM 拿到对应 schema scope 提示 */
  ownerRole: string;
  /** 非空 = 编辑模式,塞入卡片初值 */
  editing?: ObserverCard | null;
  onSaved: () => void;
}

/**
 * 3 段式 UX:
 *   ① 描述:textarea + [生成] → 调 sidecar /propose
 *   ② 预览:展示 AI 出的 SQL(只读 mini)、sample 20 行、性能 warnings、3 个图表选项
 *   ③ 保存:用户挑 chart_type + 改 title → POST /cards
 */
export default function ObserverCardDrawer({ open, onClose, ownerRole, editing, onSaved }: Props) {
  const [nl, setNl] = useState('');
  const [sql, setSql] = useState<string | null>(null);
  const [chartSuggestions, setChartSuggestions] = useState<ChartSuggestion[]>([]);
  const [pickedChart, setPickedChart] = useState<ChartType | null>(null);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<GuardWarning | null>(null);
  const [aiMessage, setAiMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNl(editing.nl_query);
      setSql(null);                     // 编辑模式下也要让用户重新触发一次 propose
      setChartSuggestions([]);
      setPickedChart(editing.chart_type);
      setTitle(editing.title);
      setPreview(null);
      setAiMessage('要修改这张卡:可以直接改标题/可视化,或在上面改描述重新生成 SQL。');
    } else {
      setNl('');
      setSql(null);
      setChartSuggestions([]);
      setPickedChart(null);
      setTitle('');
      setPreview(null);
      setAiMessage('');
    }
  }, [open, editing]);

  const proposeMut = useMutation({
    mutationFn: () => proposeObserverCard(nl.trim(), ownerRole),
    onSuccess: (data) => {
      if (!data.ok || !data.sql) {
        setSql(null);
        setChartSuggestions([]);
        setAiMessage(data.ai_message || '生成失败,请换种描述。');
        return;
      }
      setSql(data.sql);
      setChartSuggestions(data.chart_suggestions ?? []);
      setPickedChart(data.chart_suggestions?.[0]?.type ?? 'table');
      setTitle(data.title_suggestion || title || '观察员卡');
      setAiMessage(data.ai_message || '');
      // 立刻试跑一段拿 sample
      previewMut.mutate(data.sql);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '生成失败')),
  });

  const previewMut = useMutation({
    mutationFn: (sqlText: string) => previewObserverSql(sqlText),
    onSuccess: (data) => setPreview(data),
    onError: (e: unknown) => {
      setPreview(null);
      message.error(describeApiError(e, '试跑失败,可能是 SQL 命中性能闸门'));
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!sql || !pickedChart) throw new Error('请先生成预览并挑选可视化');
      const payload = {
        title: title.trim(),
        nl_query: nl.trim(),
        sql_text: sql,
        chart_type: pickedChart,
      };
      return editing
        ? updateObserverCard(editing.id, payload)
        : createObserverCard(payload);
    },
    onSuccess: () => {
      message.success(editing ? '已保存' : '已新建观察员卡');
      onSaved();
      onClose();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });

  const sampleColumns = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (rows.length === 0) return [];
    return Object.keys(rows[0]).map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true }));
  }, [preview]);

  const canSave = !!sql && !!pickedChart && title.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? `编辑观察员卡 · ${editing.title}` : '新建观察员卡'}
      width={620}
      destroyOnHidden
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMut.isPending}
            disabled={!canSave}
            onClick={() => saveMut.mutate()}
          >
            {editing ? '保存修改' : '保存到我的观察员'}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* ① 描述 */}
        <div>
          <Text strong>1. 描述你想看的数据</Text>
          <Input.TextArea
            rows={3}
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder="例:本院各班这学期的请假通过率,按月分组"
            maxLength={500}
            showCount
            style={{ marginTop: 8 }}
          />
          <Button
            type="primary"
            icon={<BulbOutlined />}
            loading={proposeMut.isPending}
            disabled={nl.trim().length < 2}
            onClick={() => proposeMut.mutate()}
            style={{ marginTop: 8 }}
          >
            生成预览
          </Button>
        </div>

        {aiMessage && (
          <Alert
            type={sql ? 'info' : 'warning'}
            showIcon
            message={aiMessage}
          />
        )}

        {/* ② 预览 */}
        {sql && (
          <>
            <div>
              <Text strong>2. 数据预览(最多 20 行 sample)</Text>
              {previewMut.isPending ? (
                <div style={{ marginTop: 12 }}><Spin /></div>
              ) : preview && preview.rows.length > 0 ? (
                <Table
                  size="small"
                  rowKey={(_, idx) => String(idx)}
                  dataSource={preview.rows}
                  columns={sampleColumns}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  style={{ marginTop: 8 }}
                />
              ) : (
                <Empty description="无数据(SQL 跑出 0 行)" style={{ marginTop: 12 }} />
              )}
            </div>

            {/* 性能/警告 */}
            {preview && (
              <Space wrap size={[8, 8]}>
                <Tag icon={<ThunderboltOutlined />} color="blue">
                  cost ≈ {preview.plan_cost}
                </Tag>
                <Tag color="default">扫描行 ≈ {preview.plan_rows}</Tag>
                <Tag color="green">用时 {preview.actual_ms} ms</Tag>
                {preview.warnings.map((w) => (
                  <Tag key={w} color="gold">{w}</Tag>
                ))}
              </Space>
            )}

            {/* SQL 折叠展示(老师不太需要看,但管理员可能想审) */}
            <Paragraph
              copyable
              style={{
                background: 'var(--bg-2, #f5f5f5)',
                padding: 8,
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 12,
                marginTop: 0,
              }}
              ellipsis={{ rows: 3, expandable: true, symbol: '展开 SQL' }}
            >
              {sql}
            </Paragraph>

            {/* ③ 挑可视化 */}
            <div>
              <Text strong>3. 挑可视化方式</Text>
              <div style={{ marginTop: 8 }}>
                <Radio.Group
                  value={pickedChart}
                  onChange={(e) => setPickedChart(e.target.value)}
                >
                  {chartSuggestions.map((c) => (
                    <Tooltip key={c.type} title={c.reason}>
                      <Radio.Button value={c.type}>{CHART_LABEL[c.type]}</Radio.Button>
                    </Tooltip>
                  ))}
                </Radio.Group>
              </div>
            </div>

            {/* 标题 */}
            <div>
              <Text strong>4. 卡片标题</Text>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="给这张卡起个名"
                style={{ marginTop: 8 }}
              />
            </div>
          </>
        )}
      </Space>
    </Drawer>
  );
}
