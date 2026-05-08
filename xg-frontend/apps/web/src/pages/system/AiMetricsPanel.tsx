import { useState } from 'react';
import { Card, Empty, Progress, Segmented, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getAiMetrics, type AiMetricsResponse } from '@/api/system';
import styles from './index.module.css';

const { Text } = Typography;

const FIELD_LABELS: Record<string, string> = {
  leave_type: '假别',
  reason: '事由',
  start_date: '开始日期',
  end_date: '结束日期',
  destination: '目的地',
};

const REC_LABEL: Record<string, string> = {
  approve: '通过',
  caution: '谨慎',
  reject: '驳回',
};

const REC_COLOR: Record<string, string> = {
  approve: 'green',
  caution: 'gold',
  reject: 'red',
};

export default function AiMetricsPanel() {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading } = useQuery<AiMetricsResponse>({
    queryKey: ['aiMetrics', days],
    queryFn: () => getAiMetrics(days),
    staleTime: 60 * 1000,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space>
        <Text type="secondary" style={{ fontSize: 13 }}>统计窗口</Text>
        <Segmented
          value={days}
          options={[
            { label: '近 7 天', value: 7 },
            { label: '近 30 天', value: 30 },
            { label: '近 90 天', value: 90 },
          ]}
          onChange={(v) => setDays(Number(v))}
        />
      </Space>

      {isLoading || !data ? (
        <Card><Spin size="small" /> 加载中…</Card>
      ) : (
        <>
          {/* AI 推荐采纳 */}
          <Card title="AI 审批建议采纳率" size="small">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Statistic
                title="采纳率（同意/坚定决策）"
                value={data.recommendation.agreement_rate ?? 0}
                suffix={data.recommendation.agreement_rate == null ? '—' : '%'}
                precision={1}
              />
              <Statistic title="同意" value={data.recommendation.agree} />
              <Statistic title="不同意" value={data.recommendation.disagree} valueStyle={{ color: '#cf1322' }} />
              <Statistic title="谨慎（无明确立场）" value={data.recommendation.unclear} />
              <Statistic title="无 AI 建议" value={data.recommendation.no_ai} />
              <Statistic title="总记录" value={data.recommendation.total} />
            </div>
            {data.recommendation.total === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                此时间窗内尚无审批记录，等辅导员陆续审批后这里会有数据。
              </Text>
            )}
          </Card>

          {/* AI Draft 字段命中 */}
          <Card title={`AI 自动填表准确率（${data.draft.total_with_draft} 条 chat-driven 提交）`} size="small">
            {data.draft.total_with_draft === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无 chat 渠道提交的请假；学生通过小夕发起请假后这里会出数据。
              </Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.draft.fields.map((f) => {
                  const tried = f.match + f.mismatch;
                  return (
                    <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 80, fontSize: 13, color: 'var(--fg-2)' }}>
                        {FIELD_LABELS[f.field] ?? f.field}
                      </span>
                      <Progress
                        percent={f.accuracy ?? 0}
                        format={() => f.accuracy == null ? '未尝试' : `${f.accuracy}%`}
                        size="small"
                        strokeColor={
                          f.accuracy == null ? '#bfbfbf'
                          : f.accuracy >= 90 ? '#52c41a'
                          : f.accuracy >= 70 ? '#faad14'
                          : '#ff4d4f'
                        }
                        style={{ flex: 1, marginRight: 0 }}
                      />
                      <span style={{ width: 110, fontSize: 12, color: 'var(--fg-3)', textAlign: 'right' }}>
                        {tried > 0 ? `${f.match}/${tried} 命中` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 不同意样本 */}
          <Card title={`最近 ${data.recent_disagreements.length} 条「AI 不同意」样本`} size="small">
            {data.recent_disagreements.length === 0 ? (
              <Empty description="窗口内 AI 与人工无明确分歧" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.recent_disagreements.map((d) => (
                  <div
                    key={d.id}
                    className={styles.tableCard}
                    style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--bd-2)' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <Tag bordered={false}>{d.biz_type ?? '—'}</Tag>
                      <Tag color={REC_COLOR[d.ai_recommendation ?? ''] ?? 'default'} bordered={false}>
                        AI: {REC_LABEL[d.ai_recommendation ?? ''] ?? d.ai_recommendation}
                      </Tag>
                      <Tag color={d.human_decision === 'approve' ? 'green' : 'red'} bordered={false}>
                        人: {d.human_decision === 'approve' ? '通过' : '驳回'}
                      </Tag>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-3)' }}>
                        {dayjs(d.created_at).format('MM-DD HH:mm')}
                      </span>
                    </div>
                    {d.ai_headline && (
                      <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                        AI 建议：<Text>{d.ai_headline}</Text>
                      </div>
                    )}
                    {d.human_comment && (
                      <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 2 }}>
                        审批意见：<Text>{d.human_comment}</Text>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
