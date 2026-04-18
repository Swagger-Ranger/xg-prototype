import { Drawer, Progress, Table, Button, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { CollectionForm, CollectionSubmission } from '@/api/collection';
import { getFormProgress, remindForm } from '@/api/collection';

interface Props {
  form: CollectionForm | null;
  onClose: () => void;
}

const columns: ColumnsType<CollectionSubmission> = [
  {
    title: '学生',
    dataIndex: 'student_id',
    width: 120,
    render: (v: string, record: CollectionSubmission) => (record as any).student_name ?? v,
  },
  {
    title: '提交时间',
    dataIndex: 'submitted_at',
    width: 160,
    render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 80,
  },
];

export default function ProgressDrawer({ form, onClose }: Props) {
  const open = form !== null;

  const { data: progress } = useQuery({
    queryKey: ['formProgress', form?.id],
    queryFn: () => getFormProgress(form!.id),
    enabled: open,
  });

  const remindMutation = useMutation({
    mutationFn: () => remindForm(form!.id),
    onSuccess: () => {
      message.success('催填通知已发送');
    },
    onError: () => {
      message.error('发送催填通知失败，请重试');
    },
  });

  const submitted = progress?.submitted ?? 0;
  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.round((submitted / total) * 100) : 0;

  return (
    <Drawer
      title={form?.title ?? '填报进度'}
      open={open}
      onClose={onClose}
      width={600}
      extra={
        <Space>
          <Button onClick={() => message.info('导出功能即将上线')}>导出</Button>
          <Button
            type="primary"
            loading={remindMutation.isPending}
            onClick={() => remindMutation.mutate()}
            disabled={form?.status !== 'published'}
          >
            催填
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>
            截止时间：{form?.deadline ? dayjs(form.deadline).format('YYYY-MM-DD HH:mm') : '无'}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--fg)' }}>
            {submitted} / {total}
          </span>
        </div>
        <Progress percent={percent} strokeColor="var(--ac)" />
      </div>

      <Table<CollectionSubmission>
        rowKey="id"
        columns={columns}
        dataSource={progress?.submissions ?? []}
        size="middle"
        pagination={false}
      />
    </Drawer>
  );
}
