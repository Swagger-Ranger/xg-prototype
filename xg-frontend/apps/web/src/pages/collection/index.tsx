import { useState, useEffect } from 'react';
import { Table, Tag, Button, Segmented, message, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CollectionForm } from '@/api/collection';
import { getMyForms, publishForm, closeForm } from '@/api/collection';
import { useAIActionStore } from '@/stores/ai-action.store';
import CreateFormModal from './CreateFormModal';
import ProgressDrawer from './ProgressDrawer';
import styles from './index.module.css';

type TabKey = 'all' | 'published' | 'closed';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '进行中',
  closed: '已关闭',
};

const STATUS_COLOR: Record<string, string> = {
  draft: '#6b7280',
  published: '#2563eb',
  closed: '#9ca3af',
};

export default function CollectionManagement() {
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [progressForm, setProgressForm] = useState<CollectionForm | null>(null);

  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);

  useEffect(() => {
    if (aiAction?.type === 'open_collection_form') {
      setCreateOpen(true);
      consumeAction();
    }
  }, [aiAction, consumeAction]);

  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;

  const queryParams = {
    page,
    size: PAGE_SIZE,
    status: tab === 'all' ? undefined : tab === 'published' ? 'published' : 'closed',
  };

  const { data, isFetching } = useQuery({
    queryKey: ['collectionForms', queryParams],
    queryFn: () => getMyForms(queryParams),
  });

  const publishMutation = useMutation({
    mutationFn: publishForm,
    onSuccess: () => {
      message.success('发布成功');
      queryClient.invalidateQueries({ queryKey: ['collectionForms'] });
    },
    onError: () => {
      message.error('发布失败，请重试');
    },
  });

  const closeMutation = useMutation({
    mutationFn: closeForm,
    onSuccess: () => {
      message.success('已关闭');
      queryClient.invalidateQueries({ queryKey: ['collectionForms'] });
    },
    onError: () => {
      message.error('关闭失败，请重试');
    },
  });

  const handleTabChange = (val: string | number) => {
    setTab(val as TabKey);
    setPage(1);
  };

  const columns: ColumnsType<CollectionForm> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => {
        const color = STATUS_COLOR[status] ?? '#6b7280';
        const label = STATUS_LABEL[status] ?? status;
        return (
          <Tag
            className={styles.statusTag}
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {label}
          </Tag>
        );
      },
    },
    {
      title: '截止时间',
      dataIndex: 'deadline',
      width: 140,
      render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm') : '—'),
    },
    {
      title: '填报进度',
      key: 'progress',
      width: 160,
      render: () => '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <span>
          <button
            className={styles.actionLink}
            onClick={() => setProgressForm(record)}
          >
            查看进度
          </button>
          {record.status === 'draft' && (
            <button
              className={styles.actionLink}
              onClick={() => publishMutation.mutate(record.id)}
            >
              发布
            </button>
          )}
          {record.status === 'published' && (
            <button
              className={`${styles.actionLink} ${styles.warn}`}
              onClick={() => Modal.confirm({
                title: '确认关闭',
                content: '确定要关闭该收集单吗？关闭后学生将无法继续填报。',
                okText: '确定',
                cancelText: '取消',
                onOk: () => closeMutation.mutate(record.id),
              })}
            >
              关闭
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>信息收集</h1>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          新建收集单
        </Button>
      </div>

      <Segmented
        className={styles.segmented}
        options={[
          { label: '全部', value: 'all' },
          { label: '进行中', value: 'published' },
          { label: '已关闭', value: 'closed' },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      <div className={styles.tableCard}>
        <Table<CollectionForm>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      <CreateFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ProgressDrawer form={progressForm} onClose={() => setProgressForm(null)} />
    </div>
  );
}
