import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Punishment, ViolationRecord } from '@/api/violation';
import {
  issuePunishment,
  listPunishments,
  listViolations,
  recordViolation,
} from '@/api/violation';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

const { TextArea } = Input;

const CATEGORY_OPTIONS = [
  { label: '考试违纪', value: 'exam' },
  { label: '学术不端', value: 'academic' },
  { label: '宿舍违规', value: 'dorm' },
  { label: '打架斗殴', value: 'fight' },
  { label: '网络违规', value: 'cyber' },
  { label: '其他', value: 'other' },
];
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const LEVEL_OPTIONS = [
  { label: '警告', value: 'warning', color: '#faad14' },
  { label: '严重警告', value: 'serious_warning', color: '#fa8c16' },
  { label: '记过', value: 'demerit', color: '#ff7a45' },
  { label: '留校察看', value: 'probation', color: '#ff4d4f' },
  { label: '开除学籍', value: 'expulsion', color: '#cf1322' },
];
const LEVEL_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(
  LEVEL_OPTIONS.map((o) => [o.value, { label: o.label, color: o.color }]),
);

const STATUS_LABELS: Record<string, string> = {
  effective: '生效中',
  lifted: '已解除',
  rejected: '已撤销',
  pending: '待下达',
};

const PAGE_SIZE = 20;

type Tab = 'violations' | 'punishments';

export default function ViolationManagement() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('violations');
  const [page, setPage] = useState(1);

  const [recordOpen, setRecordOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [detailViolation, setDetailViolation] = useState<ViolationRecord | null>(null);
  const [detailPunishment, setDetailPunishment] = useState<Punishment | null>(null);

  const [recordForm] = Form.useForm();
  const [issueForm] = Form.useForm();

  const setContext = useAIActionStore((s) => s.setContext);
  useEffect(() => {
    setContext({
      page: 'violation',
      modal: recordOpen ? 'violation_record' : issueOpen ? 'punishment_issue' : undefined,
    });
  }, [recordOpen, issueOpen, setContext]);

  const violationsQuery = useQuery({
    queryKey: ['violations', page],
    queryFn: () => listViolations({ page, size: PAGE_SIZE }),
    enabled: tab === 'violations',
  });

  const punishmentsQuery = useQuery({
    queryKey: ['punishments', page],
    queryFn: () => listPunishments({ page, size: PAGE_SIZE }),
    enabled: tab === 'punishments',
  });

  const recordMutation = useMutation({
    mutationFn: recordViolation,
    onSuccess: () => {
      message.success('违纪已登记');
      setRecordOpen(false);
      recordForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['violations'] });
    },
    onError: () => message.error('登记失败，请重试'),
  });

  const issueMutation = useMutation({
    mutationFn: issuePunishment,
    onSuccess: () => {
      message.success('处分已下达');
      setIssueOpen(false);
      issueForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['punishments'] });
      queryClient.invalidateQueries({ queryKey: ['violations'] });
    },
    onError: () => message.error('下达失败，请重试'),
  });

  const handleRecord = () => {
    recordForm.validateFields().then((v) => {
      recordMutation.mutate({
        student_id: String(v.student_id),
        student_name: v.student_name,
        category: v.category,
        occurred_at: (v.occurred_at as Dayjs).toISOString(),
        location: v.location,
        description: v.description,
      });
    });
  };

  const handleIssue = () => {
    issueForm.validateFields().then((v) => {
      issueMutation.mutate({
        violation_record_id: v.violation_record_id ? String(v.violation_record_id) : undefined,
        student_id: String(v.student_id),
        student_name: v.student_name,
        level: v.level,
        reason: v.reason,
        effective_date: (v.effective_date as Dayjs).format('YYYY-MM-DD'),
        expiry_date: v.expiry_date ? (v.expiry_date as Dayjs).format('YYYY-MM-DD') : undefined,
      });
    });
  };

  const renderLevel = (v: string) => {
    const conf = LEVEL_MAP[v];
    if (!conf) return v;
    return (
      <Tag
        className={styles.levelTag}
        style={{
          backgroundColor: `${conf.color}18`,
          color: conf.color,
          borderColor: `${conf.color}40`,
        }}
      >
        {conf.label}
      </Tag>
    );
  };

  const violationColumns: ColumnsType<ViolationRecord> = [
    { title: '学生姓名', dataIndex: 'student_name', width: 110 },
    {
      title: '类别',
      dataIndex: 'category',
      width: 110,
      render: (v: string) => CATEGORY_LABELS[v] ?? v,
    },
    {
      title: '发生时间',
      dataIndex: 'occurred_at',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    { title: '地点', dataIndex: 'location', width: 140, ellipsis: true },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '记录人', dataIndex: 'recorder_name', width: 100 },
    {
      title: '处分',
      dataIndex: 'punishment_id',
      width: 80,
      render: (v: string | null) => (v ? <Tag color="red">已处分</Tag> : <span style={{ color: 'var(--fg-4)' }}>—</span>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setDetailViolation(r)}>查看</button>
          {!r.punishment_id && (
            <button
              className={styles.actionLink}
              style={{ marginLeft: 12 }}
              onClick={() => {
                issueForm.setFieldsValue({
                  violation_record_id: r.id,
                  student_id: r.student_id,
                  student_name: r.student_name,
                });
                setIssueOpen(true);
              }}
            >
              下达处分
            </button>
          )}
        </>
      ),
    },
  ];

  const punishmentColumns: ColumnsType<Punishment> = [
    { title: '学生姓名', dataIndex: 'student_name', width: 110 },
    {
      title: '处分等级',
      dataIndex: 'level',
      width: 120,
      render: renderLevel,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => <Tag>{STATUS_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '生效日期',
      dataIndex: 'effective_date',
      width: 120,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '失效日期',
      dataIndex: 'expiry_date',
      width: 120,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '长期'),
    },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: '下达人', dataIndex: 'issuer_name', width: 100 },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <button className={styles.actionLink} onClick={() => setDetailPunishment(r)}>查看</button>
      ),
    },
  ];

  const paginationProps = (total: number) => ({
    current: page,
    pageSize: PAGE_SIZE,
    total,
    onChange: setPage,
    showSizeChanger: false,
    showTotal: (t: number) => `共 ${t} 条`,
    size: 'small' as const,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>违纪与处分</h1>
        <div className={styles.actions}>
          <Button onClick={() => setRecordOpen(true)}>登记违纪</Button>
          <Button
            type="primary"
            onClick={() => {
              issueForm.resetFields();
              setIssueOpen(true);
            }}
          >
            下达处分
          </Button>
        </div>
      </div>

      <Segmented
        className={styles.segmented}
        options={[
          { label: '违纪记录', value: 'violations' },
          { label: '处分', value: 'punishments' },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setPage(1);
        }}
      />

      <div className={styles.tableCard}>
        {tab === 'violations' ? (
          <Table<ViolationRecord>
            rowKey="id"
            columns={violationColumns}
            dataSource={violationsQuery.data?.data ?? []}
            loading={violationsQuery.isFetching}
            pagination={paginationProps(Number(violationsQuery.data?.total ?? 0))}
            size="middle"
          />
        ) : (
          <Table<Punishment>
            rowKey="id"
            columns={punishmentColumns}
            dataSource={punishmentsQuery.data?.data ?? []}
            loading={punishmentsQuery.isFetching}
            pagination={paginationProps(Number(punishmentsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
      </div>

      {/* Violation detail */}
      <Drawer
        title="违纪详情"
        open={detailViolation !== null}
        onClose={() => setDetailViolation(null)}
        width={480}
      >
        {detailViolation && (
          <div className={styles.drawerBody}>
            <Field label="学生" value={detailViolation.student_name} />
            <Field label="类别" value={CATEGORY_LABELS[detailViolation.category] ?? detailViolation.category} />
            <Field label="发生时间" value={dayjs(detailViolation.occurred_at).format('YYYY-MM-DD HH:mm')} />
            <Field label="地点" value={detailViolation.location || '—'} />
            <Field label="描述" value={detailViolation.description} />
            <Field label="记录人" value={detailViolation.recorder_name} />
            <Field label="处分" value={detailViolation.punishment_id ? '已关联处分' : '未处分'} />
          </div>
        )}
      </Drawer>

      {/* Punishment detail */}
      <Drawer
        title="处分详情"
        open={detailPunishment !== null}
        onClose={() => setDetailPunishment(null)}
        width={480}
      >
        {detailPunishment && (
          <div className={styles.drawerBody}>
            <Field label="学生" value={detailPunishment.student_name} />
            <Field label="等级" value={<>{renderLevel(detailPunishment.level)}</>} />
            <Field label="状态" value={STATUS_LABELS[detailPunishment.status] ?? detailPunishment.status} />
            <Field
              label="生效日期"
              value={detailPunishment.effective_date ? dayjs(detailPunishment.effective_date).format('YYYY-MM-DD') : '—'}
            />
            <Field
              label="失效日期"
              value={detailPunishment.expiry_date ? dayjs(detailPunishment.expiry_date).format('YYYY-MM-DD') : '长期'}
            />
            <Field label="原因" value={detailPunishment.reason} />
            <Field label="下达人" value={detailPunishment.issuer_name} />
          </div>
        )}
      </Drawer>

      {/* Record violation modal */}
      <Modal
        title="登记违纪"
        open={recordOpen}
        onOk={handleRecord}
        onCancel={() => {
          setRecordOpen(false);
          recordForm.resetFields();
        }}
        okText="提交"
        cancelText="取消"
        confirmLoading={recordMutation.isPending}
        width={560}
      >
        <Form form={recordForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="学生 ID" name="student_id" rules={[{ required: true, message: '请输入学生 ID' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="系统内的学生用户 ID" />
          </Form.Item>
          <Form.Item label="学生姓名" name="student_name" rules={[{ required: true, message: '请输入学生姓名' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="类别" name="category" rules={[{ required: true, message: '请选择类别' }]}>
            <Select options={CATEGORY_OPTIONS} placeholder="请选择违纪类别" />
          </Form.Item>
          <Form.Item label="发生时间" name="occurred_at" rules={[{ required: true, message: '请选择发生时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="地点" name="location">
            <Input maxLength={200} placeholder="选填" />
          </Form.Item>
          <Form.Item label="描述" name="description" rules={[{ required: true, message: '请输入描述' }]}>
            <TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* Issue punishment modal */}
      <Modal
        title="下达处分"
        open={issueOpen}
        onOk={handleIssue}
        onCancel={() => {
          setIssueOpen(false);
          issueForm.resetFields();
        }}
        okText="下达"
        cancelText="取消"
        confirmLoading={issueMutation.isPending}
        width={560}
      >
        <Form form={issueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="关联违纪 ID" name="violation_record_id">
            <Input placeholder="选填；从违纪记录页点「下达处分」会自动填入" />
          </Form.Item>
          <Form.Item label="学生 ID" name="student_id" rules={[{ required: true, message: '请输入学生 ID' }]}>
            <Input placeholder="学生用户 ID" />
          </Form.Item>
          <Form.Item label="学生姓名" name="student_name" rules={[{ required: true, message: '请输入学生姓名' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="处分等级" name="level" rules={[{ required: true, message: '请选择等级' }]}>
            <Select options={LEVEL_OPTIONS.map(({ label, value }) => ({ label, value }))} />
          </Form.Item>
          <Form.Item label="生效日期" name="effective_date" rules={[{ required: true, message: '请选择生效日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="失效日期" name="expiry_date">
            <DatePicker style={{ width: '100%' }} placeholder="不填=长期" />
          </Form.Item>
          <Form.Item label="处分原因" name="reason" rules={[{ required: true, message: '请输入原因' }]}>
            <TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}
