import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DecisionData,
  WorkStudyApplication,
  WorkStudyPosition,
} from '@/api/workStudy';
import {
  apply,
  closePosition,
  createPosition,
  decideApplication,
  listApplications,
  listPositions,
} from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

const { TextArea } = Input;

const POSITION_STATUS_LABELS: Record<string, string> = {
  open: '招聘中',
  closed: '已关闭',
};
const POSITION_STATUS_COLORS: Record<string, string> = {
  open: '#52c41a',
  closed: '#8c8c8c',
};

const APP_STATUS_LABELS: Record<string, string> = {
  pending: '已提交',
  recommended: '已推荐',
  hired: '已录用',
  rejected: '未通过',
};
const APP_STATUS_COLORS: Record<string, string> = {
  pending: '#1677ff',
  recommended: '#faad14',
  hired: '#52c41a',
  rejected: '#ff4d4f',
};

const TYPE_OPTIONS = [
  { label: '行政助理', value: 'assistant' },
  { label: '图书馆', value: 'library' },
  { label: '实验室', value: 'lab' },
  { label: '校园服务', value: 'service' },
  { label: '其他', value: 'other' },
];

const AID_OPTIONS = [
  { label: '一档', value: 'tier1' },
  { label: '二档', value: 'tier2' },
  { label: '三档', value: 'tier3' },
  { label: '无', value: 'none' },
];

const PAGE_SIZE = 20;

type Tab = 'positions' | 'applications';

export default function WorkStudyManagement() {
  const queryClient = useQueryClient();
  const { isStudent } = useAuth();

  const [tab, setTab] = useState<Tab>('positions');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [applyPosition, setApplyPosition] = useState<WorkStudyPosition | null>(null);
  const [decideRecord, setDecideRecord] = useState<WorkStudyApplication | null>(null);
  const [positionDetail, setPositionDetail] = useState<WorkStudyPosition | null>(null);

  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();
  const [decideForm] = Form.useForm();

  const setContext = useAIActionStore((s) => s.setContext);
  useEffect(() => {
    const modal = createOpen
      ? 'position_create'
      : applyPosition
      ? 'work_study_apply'
      : decideRecord
      ? 'work_study_decide'
      : undefined;
    setContext({ page: 'work-study', modal });
  }, [createOpen, applyPosition, decideRecord, setContext]);

  // Positions query: students see only open; admins see everything
  const positionsQuery = useQuery({
    queryKey: ['wsPositions', page, isStudent],
    queryFn: () =>
      listPositions({
        page,
        size: PAGE_SIZE,
        status: isStudent ? 'open' : undefined,
      }),
    enabled: tab === 'positions',
  });

  // Applications query: students see own; admins see all
  const applicationsQuery = useQuery({
    queryKey: ['wsApplications', page],
    queryFn: () => listApplications({ page, size: PAGE_SIZE }),
    enabled: tab === 'applications',
  });

  const createMutation = useMutation({
    mutationFn: createPosition,
    onSuccess: () => {
      message.success('岗位已发布');
      setCreateOpen(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: () => message.error('发布失败，请重试'),
  });

  const closeMutation = useMutation({
    mutationFn: closePosition,
    onSuccess: () => {
      message.success('岗位已关闭');
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: () => message.error('关闭失败'),
  });

  const applyMutation = useMutation({
    mutationFn: apply,
    onSuccess: () => {
      message.success('申请已提交');
      setApplyPosition(null);
      applyForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
    },
    onError: () => message.error('申请失败（是否已申请过？）'),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DecisionData }) => decideApplication(id, data),
    onSuccess: () => {
      message.success('已处理');
      setDecideRecord(null);
      decideForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: () => message.error('处理失败，请重试'),
  });

  const handleCreate = () => {
    createForm.validateFields().then((v) => {
      createMutation.mutate({
        title: v.title,
        position_type: v.position_type,
        department_name: v.department_name,
        description: v.description,
        requirements: v.requirements,
        prefer_financial_aid: v.prefer_financial_aid ?? false,
        hourly_rate: String(v.hourly_rate),
        weekly_hours: v.weekly_hours,
        headcount: v.headcount,
        start_date: v.start_date ? (v.start_date as Dayjs).format('YYYY-MM-DD') : undefined,
        end_date: v.end_date ? (v.end_date as Dayjs).format('YYYY-MM-DD') : undefined,
      });
    });
  };

  const handleApply = () => {
    if (!applyPosition) return;
    applyForm.validateFields().then((v) => {
      applyMutation.mutate({
        position_id: applyPosition.id,
        financial_aid_level: v.financial_aid_level,
        intro: v.intro,
      });
    });
  };

  const handleDecide = () => {
    if (!decideRecord) return;
    decideForm.validateFields().then((v) => {
      decideMutation.mutate({
        id: decideRecord.id,
        data: { status: v.status, decision_note: v.decision_note },
      });
    });
  };

  const positionColumns: ColumnsType<WorkStudyPosition> = [
    { title: '岗位', dataIndex: 'title', ellipsis: true },
    { title: '部门', dataIndex: 'department_name', width: 140 },
    {
      title: '类型',
      dataIndex: 'position_type',
      width: 110,
      render: (v: string | null) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '—',
    },
    {
      title: '时薪',
      dataIndex: 'hourly_rate',
      width: 100,
      render: (v: string) => `¥${Number(v).toFixed(2)}/h`,
    },
    {
      title: '周工时',
      dataIndex: 'weekly_hours',
      width: 90,
      render: (v: number | null) => (v ? `${v}h` : '—'),
    },
    {
      title: '人数',
      key: 'headcount',
      width: 100,
      render: (_, r) =>
        r.headcount
          ? `${r.hired_count ?? 0}/${r.headcount}`
          : '—',
    },
    {
      title: '优先资助',
      dataIndex: 'prefer_financial_aid',
      width: 100,
      render: (v: boolean | null) => (v ? <Tag color="blue">是</Tag> : <span style={{ color: 'var(--fg-4)' }}>—</span>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const c = POSITION_STATUS_COLORS[v] ?? '#8c8c8c';
        return (
          <Tag
            className={styles.statusTag}
            style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}40` }}
          >
            {POSITION_STATUS_LABELS[v] ?? v}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setPositionDetail(r)}>查看</button>
          {isStudent && r.status === 'open' && (
            <button
              className={styles.actionLink}
              style={{ marginLeft: 12 }}
              onClick={() => setApplyPosition(r)}
            >
              申请
            </button>
          )}
          {!isStudent && r.status === 'open' && (
            <Popconfirm
              title="关闭后不再接受新申请，确认？"
              onConfirm={() => closeMutation.mutate(r.id)}
              okText="关闭"
              cancelText="取消"
            >
              <button className={styles.actionLink} style={{ marginLeft: 12 }}>关闭</button>
            </Popconfirm>
          )}
        </>
      ),
    },
  ];

  const applicationColumns: ColumnsType<WorkStudyApplication> = [
    { title: '学生', dataIndex: 'student_name', width: 110 },
    { title: '岗位 ID', dataIndex: 'position_id', width: 120, ellipsis: true },
    {
      title: '资助档次',
      dataIndex: 'financial_aid_level',
      width: 110,
      render: (v: string | null) => AID_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '—',
    },
    { title: '自述', dataIndex: 'intro', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => {
        const c = APP_STATUS_COLORS[v] ?? '#8c8c8c';
        return (
          <Tag
            className={styles.statusTag}
            style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}40` }}
          >
            {APP_STATUS_LABELS[v] ?? v}
          </Tag>
        );
      },
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, r) =>
        !isStudent && (r.status === 'pending' || r.status === 'recommended') ? (
          <button
            className={styles.actionLink}
            onClick={() => {
              decideForm.setFieldsValue({ status: undefined, decision_note: '' });
              setDecideRecord(r);
            }}
          >
            处理
          </button>
        ) : (
          <span style={{ color: 'var(--fg-4)' }}>—</span>
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
        <h1 className={styles.title}>勤工助学</h1>
        {!isStudent && (
          <Button type="primary" onClick={() => setCreateOpen(true)}>发布岗位</Button>
        )}
      </div>

      <Segmented
        className={styles.segmented}
        options={[
          { label: '岗位', value: 'positions' },
          { label: isStudent ? '我的申请' : '申请', value: 'applications' },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setPage(1);
        }}
      />

      <div className={styles.tableCard}>
        {tab === 'positions' ? (
          <Table<WorkStudyPosition>
            rowKey="id"
            columns={positionColumns}
            dataSource={positionsQuery.data?.data ?? []}
            loading={positionsQuery.isFetching}
            pagination={paginationProps(Number(positionsQuery.data?.total ?? 0))}
            size="middle"
          />
        ) : (
          <Table<WorkStudyApplication>
            rowKey="id"
            columns={applicationColumns}
            dataSource={applicationsQuery.data?.data ?? []}
            loading={applicationsQuery.isFetching}
            pagination={paginationProps(Number(applicationsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
      </div>

      {/* Position detail drawer */}
      <Drawer
        title="岗位详情"
        open={positionDetail !== null}
        onClose={() => setPositionDetail(null)}
        width={520}
      >
        {positionDetail && (
          <div className={styles.drawerBody}>
            <Field label="岗位" value={positionDetail.title} />
            <Field label="部门" value={positionDetail.department_name} />
            <Field
              label="类型"
              value={TYPE_OPTIONS.find((o) => o.value === positionDetail.position_type)?.label ?? positionDetail.position_type ?? '—'}
            />
            <Field label="时薪" value={`¥${Number(positionDetail.hourly_rate).toFixed(2)} / 小时`} />
            <Field label="周工时" value={positionDetail.weekly_hours ? `${positionDetail.weekly_hours} 小时` : '—'} />
            <Field
              label="招聘人数"
              value={positionDetail.headcount ? `${positionDetail.hired_count ?? 0} / ${positionDetail.headcount}` : '—'}
            />
            <Field
              label="优先资助生"
              value={positionDetail.prefer_financial_aid ? '是' : '否'}
            />
            <Field
              label="起止日期"
              value={
                positionDetail.start_date || positionDetail.end_date
                  ? `${positionDetail.start_date ?? '—'} 至 ${positionDetail.end_date ?? '长期'}`
                  : '—'
              }
            />
            <Field label="岗位描述" value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{positionDetail.description}</pre>} />
            {positionDetail.requirements && (
              <Field
                label="任职要求"
                value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{positionDetail.requirements}</pre>}
              />
            )}
          </div>
        )}
      </Drawer>

      {/* Create position modal */}
      <Modal
        title="发布勤工助学岗位"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        okText="发布"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        width={640}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }} initialValues={{ prefer_financial_aid: false }}>
          <Form.Item label="岗位名称" name="title" rules={[{ required: true, message: '请输入岗位名称' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="用人部门" name="department_name" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="岗位类型" name="position_type">
            <Select options={TYPE_OPTIONS} placeholder="选填" allowClear />
          </Form.Item>
          <Form.Item label="时薪 (元)" name="hourly_rate" rules={[{ required: true, message: '请输入时薪' }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="周工时上限" name="weekly_hours">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="招聘人数" name="headcount">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="起始日期" name="start_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="结束日期" name="end_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="prefer_financial_aid" valuePropName="checked">
            <Checkbox>优先录用家庭经济困难学生</Checkbox>
          </Form.Item>
          <Form.Item label="岗位描述" name="description" rules={[{ required: true, message: '请输入岗位描述' }]}>
            <TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="任职要求" name="requirements">
            <TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply modal */}
      <Modal
        title={applyPosition ? `申请：${applyPosition.title}` : '申请'}
        open={applyPosition !== null}
        onOk={handleApply}
        onCancel={() => {
          setApplyPosition(null);
          applyForm.resetFields();
        }}
        okText="提交申请"
        cancelText="取消"
        confirmLoading={applyMutation.isPending}
        width={560}
      >
        {applyPosition?.prefer_financial_aid && (
          <div style={{ marginBottom: 12, color: 'var(--ac)', fontSize: 13 }}>
            该岗位优先录用家庭经济困难学生
          </div>
        )}
        <Form form={applyForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="资助档次" name="financial_aid_level">
            <Select options={AID_OPTIONS} allowClear placeholder="如有请选择" />
          </Form.Item>
          <Form.Item label="自荐说明" name="intro" rules={[{ required: true, message: '请填写自荐说明' }]}>
            <TextArea rows={5} maxLength={2000} showCount placeholder="简要说明为何适合此岗位" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Decide modal */}
      <Modal
        title="处理申请"
        open={decideRecord !== null}
        onOk={handleDecide}
        onCancel={() => {
          setDecideRecord(null);
          decideForm.resetFields();
        }}
        okText="提交"
        cancelText="取消"
        confirmLoading={decideMutation.isPending}
      >
        {decideRecord && (
          <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
            {decideRecord.student_name}：{decideRecord.intro.slice(0, 50)}
            {decideRecord.intro.length > 50 ? '…' : ''}
          </div>
        )}
        <Form form={decideForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="处理结果" name="status" rules={[{ required: true, message: '请选择处理结果' }]}>
            <Select
              options={[
                { label: '推荐', value: 'recommended' },
                { label: '录用', value: 'hired' },
                { label: '拒绝', value: 'rejected' },
              ]}
            />
          </Form.Item>
          <Form.Item label="处理意见" name="decision_note">
            <TextArea rows={3} maxLength={2000} placeholder="选填" />
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
