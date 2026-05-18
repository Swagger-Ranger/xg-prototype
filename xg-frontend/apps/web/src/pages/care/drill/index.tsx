import { useState } from 'react';
import {
  Card,
  Input,
  InputNumber,
  Button,
  Alert,
  Table,
  Timeline,
  Typography,
  Space,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  drillDownStudent,
  getCareDrillLog,
  type CareDrillResult,
  type CareDrillTask,
  type CareDrillLogItem,
} from '@/api/care';
import { SeverityBadge } from '@/components/care/SeverityBadge';
import styles from './index.module.css';

const { Title, Text, Paragraph } = Typography;
const REASON_MIN = 30;

export default function CareDrillPage() {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<CareDrillResult | null>(null);

  const logQ = useQuery({
    queryKey: ['care.admin.drilllog'],
    queryFn: () => getCareDrillLog(1, 20),
  });

  const drillMut = useMutation({
    mutationFn: () => drillDownStudent(studentId!, reason.trim()),
    onSuccess: (data) => {
      setResult(data);
      if (data.quota.near_limit) {
        message.warning(
          `今日下钻已用 ${data.quota.used}/${data.quota.limit ?? '∞'}，接近上限`,
        );
      }
      qc.invalidateQueries({ queryKey: ['care.admin.drilllog'] });
    },
    // 配额满 / 非管理角色 / 理由过短都走这里，message 透传后端中文
    onError: (e) => message.error(describeApiError(e, '下钻失败')),
  });

  const reasonLen = reason.trim().length;
  const canSubmit = studentId != null && reasonLen >= REASON_MIN;

  const taskCols: ColumnsType<CareDrillTask> = [
    { title: '类型', dataIndex: 'category', width: 96, render: (v) => v ?? '—' },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 100,
      render: (s: CareDrillTask['severity']) => <SeverityBadge severity={s} />,
    },
    { title: '状态', dataIndex: 'status', width: 110 },
    {
      title: '创建',
      dataIndex: 'created_at',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '关闭',
      dataIndex: 'closed_at',
      render: (v?: string | null) =>
        v ? new Date(v).toLocaleString('zh-CN') : '—',
    },
  ];

  const logCols: ColumnsType<CareDrillLogItem> = [
    { title: '操作人', dataIndex: 'actor_name', render: (v) => v ?? '—' },
    { title: '角色', dataIndex: 'actor_role', width: 140, render: (v) => v ?? '—' },
    { title: '学生ID', dataIndex: 'student_id', width: 140 },
    { title: '理由', dataIndex: 'reason', ellipsis: true },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div className={styles.page}>
      <Title level={4}>学生下钻</Title>
      <Alert
        type="info"
        showIcon
        className={styles.notice}
        message="下钻受额度限制并全量留痕"
        description="必须填写不少于 30 字的下钻理由；每次下钻写入审计，按角色有每日额度。系统不会向学生展示其被下钻。"
      />

      <Card size="small" className={styles.block}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>学生 ID</Text>
            <InputNumber
              className={styles.sidInput}
              value={studentId ?? undefined}
              onChange={(v) => setStudentId(typeof v === 'number' ? v : null)}
              placeholder="输入学生 user id"
              controls={false}
            />
          </div>
          <div>
            <Text>
              下钻理由（不少于 {REASON_MIN} 字，当前{' '}
              <Text type={reasonLen >= REASON_MIN ? 'success' : 'danger'}>
                {reasonLen}
              </Text>
              ）
            </Text>
            <Input.TextArea
              rows={4}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明本次下钻的事由（突发事件研判 / 个案核实等）"
            />
          </div>
          <Button
            type="primary"
            disabled={!canSubmit}
            loading={drillMut.isPending}
            onClick={() => drillMut.mutate()}
          >
            下钻查看
          </Button>
        </Space>
      </Card>

      {result && (
        <Card
          size="small"
          title={`学生 ${result.student_id} · 近 90 天关怀回溯`}
          className={styles.block}
          extra={
            <Tag color={result.quota.near_limit ? 'warning' : 'default'}>
              今日额度 {result.quota.used}/{result.quota.limit ?? '∞'}
            </Tag>
          }
        >
          <Paragraph type="secondary">关怀任务摘要</Paragraph>
          <Table
            rowKey="task_id"
            size="small"
            dataSource={result.tasks}
            columns={taskCols}
            pagination={false}
            locale={{ emptyText: '近 90 天无关怀任务' }}
          />
          <Paragraph type="secondary" className={styles.auditTitle}>
            审计记录
          </Paragraph>
          {result.audit.length ? (
            <Timeline
              items={result.audit.map((a) => ({
                children: (
                  <span>
                    <Text strong>{a.action}</Text>{' '}
                    <Text type="secondary">
                      {a.actor_role ?? '系统'} ·{' '}
                      {new Date(a.created_at).toLocaleString('zh-CN')}
                    </Text>
                  </span>
                ),
              }))}
            />
          ) : (
            <Text type="secondary">近 90 天无审计记录</Text>
          )}
        </Card>
      )}

      <Card size="small" title="下钻日志" className={styles.block}>
        <Table
          rowKey={(r) => `${r.actor_id}-${r.created_at}`}
          size="small"
          loading={logQ.isLoading}
          dataSource={logQ.data?.items ?? []}
          columns={logCols}
          pagination={false}
        />
      </Card>
    </div>
  );
}
