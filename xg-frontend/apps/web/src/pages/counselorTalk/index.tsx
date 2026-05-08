import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { describeApiError } from '@/utils/api-error';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Table,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCounselorTalk,
  getCounselorTalk,
  listCounselorTalks,
  type CounselorTalk,
  type CounselorTalkTopic,
} from '@/api/counselorTalk';
import styles from './index.module.css';

const { TextArea } = Input;

const TOPIC_OPTIONS: { label: string; value: CounselorTalkTopic }[] = [
  { label: '学业', value: 'academic' },
  { label: '心理', value: 'mental' },
  { label: '纪律', value: 'discipline' },
  { label: '生涯发展', value: 'career' },
  { label: '其他', value: 'other' },
];

const TOPIC_LABELS: Record<CounselorTalkTopic, string> = Object.fromEntries(
  TOPIC_OPTIONS.map((o) => [o.value, o.label]),
) as Record<CounselorTalkTopic, string>;

const PAGE_SIZE = 20;

export default function CounselorTalkManagement() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterTopic, setFilterTopic] = useState<CounselorTalkTopic | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [alertContext, setAlertContext] = useState<string | null>(null);
  const [sourceAlertId, setSourceAlertId] = useState<string | null>(null);

  const queryParams = {
    page,
    size: PAGE_SIZE,
    student_id: filterStudentId.trim() || undefined,
    topic: filterTopic,
  };

  const listQuery = useQuery({
    queryKey: ['counselorTalks', queryParams],
    queryFn: () => listCounselorTalks(queryParams),
  });

  const detailQuery = useQuery({
    queryKey: ['counselorTalk', detailId],
    queryFn: () => getCounselorTalk(detailId!),
    enabled: detailId !== null,
  });

  const createMutation = useMutation({
    mutationFn: createCounselorTalk,
    onSuccess: () => {
      message.success('谈话记录已保存');
      setCreateOpen(false);
      setAlertContext(null);
      setSourceAlertId(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['counselorTalks'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败，请重试')),
  });

  // open create modal pre-filled when redirected from alert detail
  useEffect(() => {
    const studentId = searchParams.get('studentId');
    const studentName = searchParams.get('studentName');
    const alertId = searchParams.get('alertId');
    const context = searchParams.get('context');
    if (studentId) {
      form.setFieldsValue({
        student_id: studentId,
        student_name: studentName ?? '',
        talk_at: dayjs(),
      });
      if (context) setAlertContext(context);
      if (alertId) setSourceAlertId(alertId);
      setCreateOpen(true);
      // clear params so revisit doesn't re-open
      const next = new URLSearchParams(searchParams);
      ['studentId', 'studentName', 'alertId', 'context'].forEach((k) => next.delete(k));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    form.validateFields().then((values) => {
      createMutation.mutate({
        student_id: String(values.student_id),
        student_name: values.student_name,
        topic: values.topic,
        content: values.content,
        follow_up: values.follow_up || undefined,
        talk_at: (values.talk_at as Dayjs).toISOString(),
        source_alert_id: sourceAlertId ?? undefined,
      });
    });
  };

  const columns: ColumnsType<CounselorTalk> = [
    {
      title: '谈话时间',
      dataIndex: 'talk_at',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    { title: '学生', dataIndex: 'student_name', width: 120 },
    { title: '学生 ID', dataIndex: 'student_id', width: 110 },
    {
      title: '主题',
      dataIndex: 'topic',
      width: 110,
      render: (v: CounselorTalkTopic) => (
        <span className={styles.topicTag}>{TOPIC_LABELS[v] ?? v}</span>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string, r) => (
        <span style={{ color: 'var(--fg-2)' }}>
          {v}
          {r.source_alert_id && <span className={styles.alertBadge}>由告警发起</span>}
        </span>
      ),
    },
    { title: '辅导员', dataIndex: 'counselor_name', width: 110 },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <button className={styles.actionLink} onClick={() => setDetailId(r.id)}>
          详情
        </button>
      ),
    },
  ];

  const detail = detailQuery.data;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>辅导谈话</h1>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ talk_at: dayjs() });
            setAlertContext(null);
            setSourceAlertId(null);
            setCreateOpen(true);
          }}
        >
          记录谈话
        </Button>
      </div>

      <div className={styles.filters}>
        <Input
          placeholder="学生 ID"
          style={{ width: 180 }}
          value={filterStudentId}
          onChange={(e) => setFilterStudentId(e.target.value)}
          onPressEnter={() => setPage(1)}
          allowClear
        />
        <Select
          placeholder="全部主题"
          allowClear
          style={{ width: 160 }}
          value={filterTopic}
          onChange={(v) => {
            setFilterTopic(v);
            setPage(1);
          }}
          options={TOPIC_OPTIONS}
        />
      </div>

      <div className={styles.tableCard}>
        <Table<CounselorTalk>
          rowKey="id"
          columns={columns}
          dataSource={listQuery.data?.data ?? []}
          loading={listQuery.isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: Number(listQuery.data?.total ?? 0),
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      <Modal
        title="记录谈话"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          setAlertContext(null);
          setSourceAlertId(null);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        width={600}
      >
        {alertContext && (
          <div className={styles.contextHint}>
            <strong>告警上下文：</strong>
            {'\n'}
            {alertContext}
          </div>
        )}
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 12 }}
          initialValues={{ talk_at: dayjs() }}
        >
          <Form.Item
            label="学生 ID"
            name="student_id"
            rules={[{ required: true, message: '请输入学生 ID' }]}
          >
            <Input placeholder="学生 ID" />
          </Form.Item>
          <Form.Item
            label="学生姓名"
            name="student_name"
            rules={[{ required: true, message: '请输入学生姓名' }]}
          >
            <Input placeholder="学生姓名" maxLength={128} />
          </Form.Item>
          <Form.Item
            label="主题"
            name="topic"
            rules={[{ required: true, message: '请选择主题' }]}
          >
            <Select placeholder="请选择主题" options={TOPIC_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="谈话时间"
            name="talk_at"
            rules={[{ required: true, message: '请选择谈话时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="谈话内容"
            name="content"
            rules={[{ required: true, message: '请输入谈话内容' }]}
          >
            <TextArea rows={5} maxLength={5000} showCount placeholder="记录谈话内容、学生反馈等" />
          </Form.Item>
          <Form.Item label="后续跟进" name="follow_up">
            <TextArea rows={3} maxLength={2000} showCount placeholder="下一步计划、需要持续关注的点（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="谈话详情"
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        width={520}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="谈话时间" value={dayjs(detail.talk_at).format('YYYY-MM-DD HH:mm')} />
            <Field label="学生" value={`${detail.student_name}（${detail.student_id}）`} />
            <Field label="辅导员" value={detail.counselor_name} />
            <Field label="主题" value={TOPIC_LABELS[detail.topic] ?? detail.topic} />
            <Field label="谈话内容" value={<div style={{ whiteSpace: 'pre-wrap' }}>{detail.content}</div>} />
            {detail.follow_up && (
              <Field label="后续跟进" value={<div style={{ whiteSpace: 'pre-wrap' }}>{detail.follow_up}</div>} />
            )}
            {detail.source_alert_id && (
              <Field label="来源告警" value={<span className={styles.alertBadge}>#{detail.source_alert_id}</span>} />
            )}
            <Field label="记录于" value={dayjs(detail.created_at).format('YYYY-MM-DD HH:mm:ss')} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--fg)' }}>{value}</div>
    </div>
  );
}
