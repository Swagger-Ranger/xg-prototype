import { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Button,
  Segmented,
  Drawer,
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Rate,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Complaint, ComplaintQueryParams } from '@/api/complaint';
import {
  getMyComplaints,
  getAllComplaints,
  submitComplaint,
  replyComplaint,
  submitFeedback,
} from '@/api/complaint';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

const { TextArea } = Input;

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  replied: '已回复',
  closed: '已关闭',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--warn)',
  processing: 'var(--ac)',
  replied: 'var(--ok)',
  closed: 'var(--fg-4)',
};

const CATEGORY_LABELS: Record<string, string> = {
  teaching: '教学管理',
  logistics: '后勤服务',
  safety: '校园安全',
  other: '其他',
};

const CATEGORY_OPTIONS = [
  { label: '教学管理', value: 'teaching' },
  { label: '后勤服务', value: 'logistics' },
  { label: '校园安全', value: 'safety' },
  { label: '其他', value: 'other' },
];

const TAB_STATUS_MAP: Record<string, string> = {
  all: '',
  pending: 'pending',
  processing: 'processing',
  replied: 'replied',
};

type TabKey = 'all' | 'pending' | 'processing' | 'replied';

const PAGE_SIZE = 20;

export default function ComplaintManagement() {
  const { isStudent } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [detailRecord, setDetailRecord] = useState<Complaint | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [replyRecord, setReplyRecord] = useState<Complaint | null>(null);
  const [feedbackRecord, setFeedbackRecord] = useState<Complaint | null>(null);
  const [feedbackValue, setFeedbackValue] = useState(5);

  const [submitForm] = Form.useForm();
  const [replyForm] = Form.useForm();

  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);
  const setContext = useAIActionStore((s) => s.setContext);

  useEffect(() => {
    setContext({ page: 'complaint', modal: submitOpen ? 'complaint_submit' : undefined });
  }, [submitOpen, setContext]);

  useEffect(() => {
    if (!aiAction) return;
    if (aiAction.type === 'open_complaint_form') {
      const d = (aiAction.data ?? {}) as {
        title?: string;
        category?: string;
        content?: string;
        anonymous?: boolean;
      };
      setSubmitOpen(true);
      setTimeout(() => {
        submitForm.setFieldsValue({
          title: d.title,
          category: d.category,
          content: d.content,
          anonymous: d.anonymous ?? false,
        });
      }, 0);
      consumeAction();
    }
  }, [aiAction, consumeAction, submitForm]);

  const queryParams: ComplaintQueryParams = {
    page,
    size: PAGE_SIZE,
    status: TAB_STATUS_MAP[tab] || undefined,
  };

  const { data: myData, isFetching: myFetching } = useQuery({
    queryKey: ['myComplaints', queryParams],
    queryFn: () => getMyComplaints(queryParams),
    enabled: isStudent,
  });

  const { data: allData, isFetching: allFetching } = useQuery({
    queryKey: ['allComplaints', queryParams],
    queryFn: () => getAllComplaints(queryParams),
    enabled: !isStudent,
  });

  const currentData = isStudent ? myData : allData;
  const isLoading = isStudent ? myFetching : allFetching;

  const submitMutation = useMutation({
    mutationFn: submitComplaint,
    onSuccess: () => {
      message.success('诉求提交成功');
      setSubmitOpen(false);
      submitForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['myComplaints'] });
    },
    onError: () => {
      message.error('提交失败，请重试');
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { reply_content: string } }) =>
      replyComplaint(id, data),
    onSuccess: () => {
      message.success('回复成功');
      setReplyRecord(null);
      replyForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['allComplaints'] });
    },
    onError: () => {
      message.error('回复失败，请重试');
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, satisfaction }: { id: string; satisfaction: number }) =>
      submitFeedback(id, satisfaction),
    onSuccess: () => {
      message.success('评价提交成功');
      setFeedbackRecord(null);
      setFeedbackValue(5);
      queryClient.invalidateQueries({ queryKey: ['myComplaints'] });
    },
    onError: () => {
      message.error('评价提交失败，请重试');
    },
  });

  const handleTabChange = (val: string | number) => {
    setTab(val as TabKey);
    setPage(1);
  };

  const handleSubmit = () => {
    submitForm.validateFields().then((values) => {
      submitMutation.mutate({
        title: values.title,
        category: values.category,
        content: values.content,
        anonymous: values.anonymous ?? false,
      });
    });
  };

  const handleReply = () => {
    if (!replyRecord) return;
    replyForm.validateFields().then((values) => {
      replyMutation.mutate({ id: replyRecord.id, data: { reply_content: values.reply_content } });
    });
  };

  const handleFeedback = () => {
    if (!feedbackRecord) return;
    feedbackMutation.mutate({ id: feedbackRecord.id, satisfaction: feedbackValue });
  };

  const renderStatusTag = (status: string) => {
    const color = STATUS_COLORS[status] ?? 'var(--fg-4)';
    const label = STATUS_LABELS[status] ?? status;
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
  };

  const studentColumns: ColumnsType<Complaint> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '类别',
      dataIndex: 'category',
      width: 110,
      render: (v: string) => CATEGORY_LABELS[v] ?? v,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: renderStatusTag,
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 120,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <span>
          <button className={styles.actionLink} onClick={() => setDetailRecord(record)}>
            查看
          </button>
          {record.status === 'replied' && record.satisfaction === null && (
            <button
              className={styles.actionLink}
              onClick={() => {
                setFeedbackRecord(record);
                setFeedbackValue(5);
              }}
              style={{ marginLeft: 12 }}
            >
              评价
            </button>
          )}
        </span>
      ),
    },
  ];

  const counselorColumns: ColumnsType<Complaint> = [
    {
      title: '学生姓名',
      dataIndex: 'student_name',
      width: 100,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '类别',
      dataIndex: 'category',
      width: 110,
      render: (v: string) => CATEGORY_LABELS[v] ?? v,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: renderStatusTag,
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 120,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <span>
          <button className={styles.actionLink} onClick={() => setDetailRecord(record)}>
            查看
          </button>
          {(record.status === 'pending' || record.status === 'processing') && (
            <button
              className={styles.actionLink}
              onClick={() => setReplyRecord(record)}
              style={{ marginLeft: 12 }}
            >
              回复
            </button>
          )}
        </span>
      ),
    },
  ];

  const tabOptions = [
    { label: '全部', value: 'all' },
    { label: '待处理', value: 'pending' },
    { label: '处理中', value: 'processing' },
    { label: '已回复', value: 'replied' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{isStudent ? '我的诉求' : '接诉即办'}</h1>
        {isStudent && (
          <Button type="primary" onClick={() => setSubmitOpen(true)}>
            提交诉求
          </Button>
        )}
      </div>

      <Segmented
        className={styles.segmented}
        options={tabOptions}
        value={tab}
        onChange={handleTabChange}
      />

      <div className={styles.tableCard}>
        <Table<Complaint>
          rowKey="id"
          columns={isStudent ? studentColumns : counselorColumns}
          dataSource={currentData?.data ?? []}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: currentData?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      {/* Detail Drawer */}
      <Drawer
        title="诉求详情"
        open={detailRecord !== null}
        onClose={() => setDetailRecord(null)}
        width={480}
      >
        {detailRecord && (
          <div className={styles.drawerBody}>
            <div>
              <div className={styles.replyLabel}>标题</div>
              <div className={styles.replyContent}>{detailRecord.title}</div>
            </div>
            <div>
              <div className={styles.replyLabel}>类别</div>
              <div className={styles.replyContent}>
                {CATEGORY_LABELS[detailRecord.category] ?? detailRecord.category}
              </div>
            </div>
            <div>
              <div className={styles.replyLabel}>状态</div>
              <div>{renderStatusTag(detailRecord.status)}</div>
            </div>
            <div>
              <div className={styles.replyLabel}>提交时间</div>
              <div className={styles.replyContent}>
                {dayjs(detailRecord.created_at).format('YYYY-MM-DD HH:mm')}
              </div>
            </div>
            {!isStudent && (
              <div>
                <div className={styles.replyLabel}>提交学生</div>
                <div className={styles.replyContent}>
                  {detailRecord.anonymous ? '匿名' : detailRecord.student_name}
                </div>
              </div>
            )}
            {detailRecord.handler_name && (
              <div>
                <div className={styles.replyLabel}>处理人</div>
                <div className={styles.replyContent}>{detailRecord.handler_name}</div>
              </div>
            )}
            <div>
              <div className={styles.replyLabel}>诉求内容</div>
              <div className={styles.replyContent}>{detailRecord.content}</div>
            </div>
            {detailRecord.reply_content && (
              <div className={styles.replyCard}>
                <div className={styles.replyLabel}>处理回复</div>
                <div className={styles.replyContent}>{detailRecord.reply_content}</div>
                {detailRecord.reply_at && (
                  <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 6 }}>
                    回复时间：{dayjs(detailRecord.reply_at).format('YYYY-MM-DD HH:mm')}
                  </div>
                )}
              </div>
            )}
            {detailRecord.satisfaction !== null && (
              <div>
                <div className={styles.replyLabel}>满意度评价</div>
                <Rate disabled value={detailRecord.satisfaction} />
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Submit Complaint Modal */}
      <Modal
        title="提交诉求"
        open={submitOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setSubmitOpen(false);
          submitForm.resetFields();
        }}
        okText="提交"
        cancelText="取消"
        confirmLoading={submitMutation.isPending}
      >
        <Form form={submitForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请简要描述诉求" maxLength={100} />
          </Form.Item>
          <Form.Item
            label="类别"
            name="category"
            rules={[{ required: true, message: '请选择类别' }]}
          >
            <Select placeholder="请选择类别" options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="内容"
            name="content"
            rules={[{ required: true, message: '请输入诉求内容' }]}
          >
            <TextArea rows={5} placeholder="请详细描述您的诉求" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="anonymous" valuePropName="checked">
            <Checkbox>匿名提交</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* Reply Modal */}
      <Modal
        title="回复诉求"
        open={replyRecord !== null}
        onOk={handleReply}
        onCancel={() => {
          setReplyRecord(null);
          replyForm.resetFields();
        }}
        okText="提交回复"
        cancelText="取消"
        confirmLoading={replyMutation.isPending}
      >
        {replyRecord && (
          <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
            {replyRecord.anonymous ? '匿名学生' : replyRecord.student_name}：{replyRecord.title}
          </div>
        )}
        <Form form={replyForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="回复内容"
            name="reply_content"
            rules={[{ required: true, message: '请输入回复内容' }]}
          >
            <TextArea rows={5} placeholder="请填写处理意见和回复内容" maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* Feedback Modal */}
      <Modal
        title="满意度评价"
        open={feedbackRecord !== null}
        onOk={handleFeedback}
        onCancel={() => {
          setFeedbackRecord(null);
          setFeedbackValue(5);
        }}
        okText="提交评价"
        cancelText="取消"
        confirmLoading={feedbackMutation.isPending}
      >
        {feedbackRecord && (
          <div style={{ marginBottom: 16, color: 'var(--fg-3)', fontSize: 13 }}>
            {feedbackRecord.title}
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ marginBottom: 12, color: 'var(--fg-2)', fontSize: 14 }}>
            请对本次处理结果进行评价
          </div>
          <Rate value={feedbackValue} onChange={setFeedbackValue} />
        </div>
      </Modal>
    </div>
  );
}
