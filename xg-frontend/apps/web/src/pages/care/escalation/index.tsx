import { useState } from 'react';
import { Card, Table, Button, Tag, Typography, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  getCareOverdue,
  listCareTasks,
  urgeCareTask,
  type CareOverdueItem,
  type CareTaskView,
} from '@/api/care';
import { SeverityBadge } from '@/components/care/SeverityBadge';
import styles from './index.module.css';

const { Title, Text } = Typography;

export default function CareEscalationPage() {
  const qc = useQueryClient();
  const [urged, setUrged] = useState<Set<number>>(new Set());

  const overdueQ = useQuery({
    queryKey: ['care.admin.overdue'],
    queryFn: () => getCareOverdue(1, 50),
  });
  // 改期 ≥2 自动进入"需要介入"（W1 §6.1 / PRD §10.2）。assigneeScope=all
  // 仅管理角色服务端生效（W2.5）；CareTaskView 无责任辅导员（W1 §4.5）。
  const reschedQ = useQuery({
    queryKey: ['care.admin.resched2'],
    queryFn: () =>
      listCareTasks({
        assigneeScope: 'all',
        rescheduleAtLeast: 2,
        statuses: ['pending', 'accepted', 'in_progress', 'overdue'],
        sort: 'due_asc',
        size: 50,
      }),
  });

  const urgeMut = useMutation({
    mutationFn: (taskId: number) => urgeCareTask(taskId),
    onSuccess: (_d, taskId) => {
      message.success('已督办');
      setUrged((prev) => new Set(prev).add(taskId));
      qc.invalidateQueries({ queryKey: ['care.admin.overdue'] });
      qc.invalidateQueries({ queryKey: ['care.admin.resched2'] });
    },
    onError: (e) => message.error(describeApiError(e, '督办失败')),
  });

  // 领导界面只显示"已督办"，不暴露责任辅导员（PRD §5.2）
  const urgeCell = (taskId: number) =>
    urged.has(taskId) ? (
      <Tag color="success">已督办</Tag>
    ) : (
      <Popconfirm
        title="确认督办该任务？"
        description="系统将私下提醒责任辅导员尽快处理"
        okText="督办"
        cancelText="取消"
        onConfirm={() => urgeMut.mutate(taskId)}
      >
        <Button size="small" type="link">
          督办
        </Button>
      </Popconfirm>
    );

  const overdueCols: ColumnsType<CareOverdueItem> = [
    { title: '学生', dataIndex: 'student_name', render: (v) => v ?? '—' },
    { title: '班级', dataIndex: 'class_name', width: 160, render: (v) => v ?? '—' },
    { title: '类型', dataIndex: 'category', width: 96, render: (v) => v ?? '—' },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 100,
      render: (s: CareOverdueItem['severity']) => <SeverityBadge severity={s} />,
    },
    {
      title: '应处理时限',
      dataIndex: 'due_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 100,
      render: (_v, r) => urgeCell(r.task_id),
    },
  ];

  const reschedCols: ColumnsType<CareTaskView> = [
    { title: '学生', dataIndex: 'student_name', render: (v) => v ?? '—' },
    { title: '班级', dataIndex: 'class_name', width: 160, render: (v) => v ?? '—' },
    { title: '情况', dataIndex: 'trigger_summary', ellipsis: true },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 100,
      render: (s: CareTaskView['severity']) => <SeverityBadge severity={s} />,
    },
    { title: '改期次数', dataIndex: 'reschedule_count', width: 96 },
    {
      title: '操作',
      width: 100,
      render: (_v, r) => urgeCell(r.task_id),
    },
  ];

  return (
    <div className={styles.page}>
      <Title level={4}>需要介入</Title>
      <Text type="secondary">超期或多次改期的任务；督办仅私下提醒责任辅导员</Text>

      <Card
        size="small"
        title={`超期任务（${overdueQ.data?.total ?? 0}）`}
        className={styles.block}
      >
        <Table
          rowKey="task_id"
          size="small"
          loading={overdueQ.isLoading}
          dataSource={overdueQ.data?.items ?? []}
          columns={overdueCols}
          pagination={false}
        />
      </Card>

      <Card size="small" title="改期 ≥ 2 次" className={styles.block}>
        <Table
          rowKey="task_id"
          size="small"
          loading={reschedQ.isLoading}
          dataSource={reschedQ.data?.data ?? []}
          columns={reschedCols}
          pagination={false}
        />
      </Card>
    </div>
  );
}
