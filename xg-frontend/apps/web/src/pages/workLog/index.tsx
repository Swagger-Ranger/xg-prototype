import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkLog } from '@/api/workLog';
import { createWorkLog, deleteWorkLog, listWorkLogs } from '@/api/workLog';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

const { TextArea } = Input;
const { RangePicker } = DatePicker;

const CATEGORY_OPTIONS = [
  { label: '谈心谈话', value: 'heart_to_heart' },
  { label: '班级会议', value: 'class_meeting' },
  { label: '家访/家长沟通', value: 'home_visit' },
  { label: '学生走访', value: 'student_visit' },
  { label: '宿舍检查', value: 'dorm_check' },
  { label: '其他', value: 'other' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const PAGE_SIZE = 20;

export default function WorkLogManagement() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const setContext = useAIActionStore((s) => s.setContext);
  useEffect(() => {
    setContext({ page: 'work-log', modal: createOpen ? 'work_log_create' : undefined });
  }, [createOpen, setContext]);

  const queryParams = {
    page,
    size: PAGE_SIZE,
    category,
    start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
    end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
  };

  const { data, isFetching } = useQuery({
    queryKey: ['workLogs', queryParams],
    queryFn: () => listWorkLogs(queryParams),
  });

  const createMutation = useMutation({
    mutationFn: createWorkLog,
    onSuccess: () => {
      message.success('工作日志已保存');
      setCreateOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
    },
    onError: () => {
      message.error('保存失败，请重试');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkLog,
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
    },
    onError: () => {
      message.error('删除失败');
    },
  });

  const handleCreate = () => {
    form.validateFields().then((values) => {
      createMutation.mutate({
        category: values.category,
        title: values.title,
        content: values.content,
        log_date: (values.log_date as Dayjs).format('YYYY-MM-DD'),
      });
    });
  };

  const columns: ColumnsType<WorkLog> = [
    {
      title: '日期',
      dataIndex: 'log_date',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '类别',
      dataIndex: 'category',
      width: 130,
      render: (v: string) => (
        <span className={styles.categoryTag}>{CATEGORY_LABELS[v] ?? v}</span>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string) => <span style={{ color: 'var(--fg-2)' }}>{v}</span>,
    },
    {
      title: '记录时间',
      dataIndex: 'created_at',
      width: 150,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="确认删除这条日志？"
          onConfirm={() => deleteMutation.mutate(record.id)}
          okText="删除"
          cancelText="取消"
        >
          <button className={`${styles.actionLink} ${styles.actionLinkDanger}`}>删除</button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工作日志</h1>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          记录日志
        </Button>
      </div>

      <div className={styles.filters}>
        <Select
          placeholder="全部类别"
          allowClear
          style={{ width: 160 }}
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
          options={CATEGORY_OPTIONS}
        />
        <RangePicker
          value={dateRange}
          onChange={(v) => {
            setDateRange(v as [Dayjs, Dayjs] | null);
            setPage(1);
          }}
          placeholder={['起始日期', '结束日期']}
        />
      </div>

      <div className={styles.tableCard}>
        <Table<WorkLog>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: Number(data?.total ?? 0),
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      <Modal
        title="记录工作日志"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{ log_date: dayjs() }}
        >
          <Form.Item
            label="日期"
            name="log_date"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="类别"
            name="category"
            rules={[{ required: true, message: '请选择类别' }]}
          >
            <Select placeholder="请选择类别" options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="一句话概括" maxLength={200} />
          </Form.Item>
          <Form.Item
            label="内容"
            name="content"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <TextArea rows={6} placeholder="请记录详细内容" maxLength={4000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
