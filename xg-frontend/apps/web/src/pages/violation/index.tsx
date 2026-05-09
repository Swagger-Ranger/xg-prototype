import { useEffect, useMemo, useState } from 'react';
import { describeApiError } from '@/utils/api-error';
import {
  Button,
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
import type { Punishment, ViolationAppeal, ViolationRecord } from '@/api/violation';
import {
  approveViolation,
  issuePunishment,
  listAppeals,
  listPunishments,
  listViolations,
  recordViolation,
  rejectViolation,
  resolveAppeal,
  submitAppeal,
  submitViolation,
} from '@/api/violation';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useAuth } from '@/hooks/useAuth';
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
  revoked: '已撤销',
  pending: '待下达',
};

const APPROVAL_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending: { label: '待审批', color: 'processing' },
  approved: { label: '已审批', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  revoked: { label: '已撤销', color: 'warning' },
};

const APPEAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'processing' },
  upheld: { label: '申诉成立', color: 'success' },
  rejected: { label: '申诉驳回', color: 'error' },
};

const PAGE_SIZE = 20;

type Tab = 'violations' | 'punishments' | 'approvals' | 'appeals';

export default function ViolationManagement() {
  const queryClient = useQueryClient();
  const { user, isStudent, hasPermission } = useAuth();
  // discipline 模块当前只有一个粒度的权限码 discipline:manage：能进这个页面就
  // 同时具备「记录违纪」和「审批申诉」的能力。NavRail 已用相同权限码 gate /violation
  // 入口，所以未授权角色根本走不到这里。
  const canManage = hasPermission('discipline:manage');
  const canApprove = canManage;
  const canRecord = canManage;

  const defaultTab: Tab = 'violations';
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [page, setPage] = useState(1);

  const [recordOpen, setRecordOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ViolationRecord | null>(null);
  const [appealTarget, setAppealTarget] = useState<ViolationRecord | null>(null);
  const [resolveTarget, setResolveTarget] = useState<ViolationAppeal | null>(null);
  const [detailViolation, setDetailViolation] = useState<ViolationRecord | null>(null);
  const [detailPunishment, setDetailPunishment] = useState<Punishment | null>(null);

  const [recordForm] = Form.useForm();
  const [issueForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [appealForm] = Form.useForm();
  const [resolveForm] = Form.useForm();

  const setContext = useAIActionStore((s) => s.setContext);
  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);
  useEffect(() => {
    setContext({
      page: 'violation',
      modal: recordOpen ? 'violation_record' : issueOpen ? 'punishment_issue' : undefined,
    });
  }, [recordOpen, issueOpen, setContext]);

  useEffect(() => {
    if (aiAction?.type === 'open_violation_form') {
      const d = (aiAction.data ?? {}) as Record<string, unknown>;
      recordForm.setFieldsValue({
        student_id: d.student_id ? Number(d.student_id) : undefined,
        student_name: d.student_name,
        category: d.category,
        description: d.description,
      });
      setRecordOpen(true);
      consumeAction();
    } else if (aiAction?.type === 'open_appeal_form') {
      const d = (aiAction.data ?? {}) as Record<string, unknown>;
      appealForm.setFieldsValue({
        violation_record_id: d.violation_record_id,
        reason: d.reason,
      });
      setAppealTarget({ id: String(d.violation_record_id ?? '') } as ViolationRecord);
      consumeAction();
    }
  }, [aiAction, consumeAction, recordForm, appealForm]);

  const studentIdFilter = isStudent && user ? String(user.id) : undefined;

  const violationsQuery = useQuery({
    queryKey: ['violations', tab, page, studentIdFilter],
    queryFn: () =>
      listViolations({
        page,
        size: PAGE_SIZE,
        student_id: studentIdFilter,
      }),
    enabled: tab === 'violations',
  });

  const punishmentsQuery = useQuery({
    queryKey: ['punishments', page, studentIdFilter],
    queryFn: () => listPunishments({ page, size: PAGE_SIZE, student_id: studentIdFilter }),
    enabled: tab === 'punishments',
  });

  const approvalsQuery = useQuery({
    queryKey: ['violation-approvals', page],
    queryFn: () => listViolations({ page, size: PAGE_SIZE, approval_status: 'pending' }),
    enabled: tab === 'approvals' && canApprove,
  });

  const appealsQuery = useQuery({
    queryKey: ['appeals', page, studentIdFilter, isStudent],
    queryFn: () =>
      listAppeals({
        page,
        size: PAGE_SIZE,
        student_id: studentIdFilter,
        status: canApprove && !isStudent ? 'pending' : undefined,
      }),
    enabled: tab === 'appeals',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['violations'] });
    queryClient.invalidateQueries({ queryKey: ['violation-approvals'] });
    queryClient.invalidateQueries({ queryKey: ['appeals'] });
    queryClient.invalidateQueries({ queryKey: ['punishments'] });
  };

  const recordMutation = useMutation({
    mutationFn: recordViolation,
    onSuccess: () => {
      message.success('违纪已登记（草稿）');
      setRecordOpen(false);
      recordForm.resetFields();
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '登记失败，请重试')),
  });

  const submitMutation = useMutation({
    mutationFn: submitViolation,
    onSuccess: () => {
      message.success('已提交审批');
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '提交失败')),
  });

  const approveMutation = useMutation({
    mutationFn: approveViolation,
    onSuccess: () => {
      message.success('已审批通过');
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '审批失败')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectViolation(id, reason),
    onSuccess: () => {
      message.success('已驳回');
      setRejectTarget(null);
      rejectForm.resetFields();
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '驳回失败')),
  });

  const issueMutation = useMutation({
    mutationFn: issuePunishment,
    onSuccess: () => {
      message.success('处分已下达');
      setIssueOpen(false);
      issueForm.resetFields();
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '下达失败，请重试')),
  });

  const appealMutation = useMutation({
    mutationFn: submitAppeal,
    onSuccess: () => {
      message.success('申诉已提交');
      setAppealTarget(null);
      appealForm.resetFields();
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '申诉提交失败')),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: 'upheld' | 'rejected'; note?: string }) =>
      resolveAppeal(id, { outcome, note }),
    onSuccess: () => {
      message.success('申诉已处理');
      setResolveTarget(null);
      resolveForm.resetFields();
      invalidateAll();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '处理失败')),
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

  const handleReject = () => {
    rejectForm.validateFields().then((v) => {
      if (!rejectTarget) return;
      rejectMutation.mutate({ id: rejectTarget.id, reason: v.reason });
    });
  };

  const handleAppeal = () => {
    appealForm.validateFields().then((v) => {
      appealMutation.mutate({
        violation_record_id: String(v.violation_record_id),
        reason: v.reason,
      });
    });
  };

  const handleResolve = () => {
    resolveForm.validateFields().then((v) => {
      if (!resolveTarget) return;
      resolveMutation.mutate({ id: resolveTarget.id, outcome: v.outcome, note: v.note });
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

  const renderApproval = (v: string) => {
    const conf = APPROVAL_LABELS[v] ?? { label: v, color: 'default' };
    return <Tag color={conf.color}>{conf.label}</Tag>;
  };

  const violationColumns: ColumnsType<ViolationRecord> = [
    ...(!isStudent ? [{ title: '学生姓名', dataIndex: 'student_name', width: 110 } as const] : []),
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
      title: '状态',
      dataIndex: 'approval_status',
      width: 100,
      render: renderApproval,
    },
    {
      title: '处分',
      dataIndex: 'punishment_id',
      width: 80,
      render: (v: string | null) =>
        v ? <Tag color="red">已处分</Tag> : <span style={{ color: 'var(--fg-4)' }}>—</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setDetailViolation(r)}>查看</button>
          {canRecord && (r.approval_status === 'draft' || r.approval_status === 'rejected') && (
            <Popconfirm
              title="提交审批？"
              description={r.approval_status === 'rejected' ? '该记录已被驳回，重新提交' : undefined}
              onConfirm={() => submitMutation.mutate(r.id)}
            >
              <button className={styles.actionLink} style={{ marginLeft: 12 }}>提交审批</button>
            </Popconfirm>
          )}
          {canApprove && r.approval_status === 'approved' && !r.punishment_id && (
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
          {isStudent && r.approval_status === 'approved' && (
            <button
              className={styles.actionLink}
              style={{ marginLeft: 12 }}
              onClick={() => {
                appealForm.setFieldsValue({ violation_record_id: r.id });
                setAppealTarget(r);
              }}
            >
              申诉
            </button>
          )}
        </>
      ),
    },
  ];

  const approvalColumns: ColumnsType<ViolationRecord> = [
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
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '记录人', dataIndex: 'recorder_name', width: 100 },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      width: 150,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setDetailViolation(r)}>查看</button>
          <Popconfirm title="审批通过？" onConfirm={() => approveMutation.mutate(r.id)}>
            <button className={styles.actionLink} style={{ marginLeft: 12 }}>通过</button>
          </Popconfirm>
          <button
            className={styles.actionLink}
            style={{ marginLeft: 12 }}
            onClick={() => {
              rejectForm.resetFields();
              setRejectTarget(r);
            }}
          >
            驳回
          </button>
        </>
      ),
    },
  ];

  const appealColumns: ColumnsType<ViolationAppeal> = [
    ...(!isStudent ? [{ title: '学生姓名', dataIndex: 'student_name', width: 110 } as const] : []),
    { title: '违纪 ID', dataIndex: 'violation_record_id', width: 120 },
    { title: '申诉理由', dataIndex: 'reason', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: string) => {
        const conf = APPEAL_STATUS_LABELS[v] ?? { label: v, color: 'default' };
        return <Tag color={conf.color}>{conf.label}</Tag>;
      },
    },
    { title: '处理人', dataIndex: 'resolver_name', width: 100, render: (v: string | null) => v ?? '—' },
    { title: '处理备注', dataIndex: 'resolution_note', ellipsis: true, render: (v: string | null) => v ?? '—' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    ...(canApprove
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 120,
            render: (_: unknown, r: ViolationAppeal) =>
              r.status === 'pending' ? (
                <button
                  className={styles.actionLink}
                  onClick={() => {
                    resolveForm.resetFields();
                    setResolveTarget(r);
                  }}
                >
                  处理
                </button>
              ) : (
                <span style={{ color: 'var(--fg-4)' }}>—</span>
              ),
          } as const,
        ]
      : []),
  ];

  const punishmentColumns: ColumnsType<Punishment> = [
    ...(!isStudent ? [{ title: '学生姓名', dataIndex: 'student_name', width: 110 } as const] : []),
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

  const tabOptions = useMemo(() => {
    const opts: { label: string; value: Tab }[] = [
      { label: isStudent ? '我的违纪' : '违纪记录', value: 'violations' },
      { label: isStudent ? '我的处分' : '处分', value: 'punishments' },
    ];
    if (canApprove) opts.splice(1, 0, { label: '待审批', value: 'approvals' });
    opts.push({ label: isStudent ? '我的申诉' : '申诉', value: 'appeals' });
    return opts;
  }, [isStudent, canApprove]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{isStudent ? '我的违纪' : '违纪与处分'}</h1>
        <div className={styles.actions}>
          {canRecord && <Button onClick={() => setRecordOpen(true)}>登记违纪</Button>}
          {canApprove && (
            <Button
              type="primary"
              onClick={() => {
                issueForm.resetFields();
                setIssueOpen(true);
              }}
            >
              下达处分
            </Button>
          )}
        </div>
      </div>

      <Segmented
        className={styles.segmented}
        options={tabOptions}
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setPage(1);
        }}
      />

      <div className={styles.tableCard}>
        {tab === 'violations' && (
          <Table<ViolationRecord>
            rowKey="id"
            columns={violationColumns}
            dataSource={violationsQuery.data?.data ?? []}
            loading={violationsQuery.isFetching}
            pagination={paginationProps(Number(violationsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
        {tab === 'punishments' && (
          <Table<Punishment>
            rowKey="id"
            columns={punishmentColumns}
            dataSource={punishmentsQuery.data?.data ?? []}
            loading={punishmentsQuery.isFetching}
            pagination={paginationProps(Number(punishmentsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
        {tab === 'approvals' && canApprove && (
          <Table<ViolationRecord>
            rowKey="id"
            columns={approvalColumns}
            dataSource={approvalsQuery.data?.data ?? []}
            loading={approvalsQuery.isFetching}
            pagination={paginationProps(Number(approvalsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
        {tab === 'appeals' && (
          <Table<ViolationAppeal>
            rowKey="id"
            columns={appealColumns}
            dataSource={appealsQuery.data?.data ?? []}
            loading={appealsQuery.isFetching}
            pagination={paginationProps(Number(appealsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
      </div>

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
            <Field label="审批状态" value={renderApproval(detailViolation.approval_status)} />
            {detailViolation.approver_name && <Field label="审批人" value={detailViolation.approver_name} />}
            {detailViolation.approved_at && (
              <Field label="审批时间" value={dayjs(detailViolation.approved_at).format('YYYY-MM-DD HH:mm')} />
            )}
            {detailViolation.rejection_reason && (
              <Field label="驳回原因" value={detailViolation.rejection_reason} />
            )}
            <Field label="处分" value={detailViolation.punishment_id ? '已关联处分' : '未处分'} />
          </div>
        )}
      </Drawer>

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

      <Modal
        title="登记违纪"
        open={recordOpen}
        onOk={handleRecord}
        onCancel={() => {
          setRecordOpen(false);
          recordForm.resetFields();
        }}
        okText="保存为草稿"
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
          <div style={{ color: 'var(--fg-4)', fontSize: 12 }}>
            保存后仍为草稿，需到列表中点击「提交审批」发送给院领导审批。
          </div>
        </Form>
      </Modal>

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

      <Modal
        title="驳回审批"
        open={rejectTarget !== null}
        onOk={handleReject}
        onCancel={() => {
          setRejectTarget(null);
          rejectForm.resetFields();
        }}
        okText="确认驳回"
        cancelText="取消"
        confirmLoading={rejectMutation.isPending}
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item label="驳回原因" name="reason" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="提交申诉"
        open={appealTarget !== null}
        onOk={handleAppeal}
        onCancel={() => {
          setAppealTarget(null);
          appealForm.resetFields();
        }}
        okText="提交申诉"
        cancelText="取消"
        confirmLoading={appealMutation.isPending}
      >
        <Form form={appealForm} layout="vertical">
          <Form.Item label="违纪记录 ID" name="violation_record_id" rules={[{ required: true }]}>
            <Input disabled />
          </Form.Item>
          <Form.Item label="申诉理由" name="reason" rules={[{ required: true, message: '请填写申诉理由' }]}>
            <TextArea rows={5} maxLength={2000} showCount placeholder="请详细描述申诉依据" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="处理申诉"
        open={resolveTarget !== null}
        onOk={handleResolve}
        onCancel={() => {
          setResolveTarget(null);
          resolveForm.resetFields();
        }}
        okText="提交"
        cancelText="取消"
        confirmLoading={resolveMutation.isPending}
      >
        <Form form={resolveForm} layout="vertical" initialValues={{ outcome: 'rejected' }}>
          <Form.Item label="处理结果" name="outcome" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '申诉成立（撤销违纪及处分）', value: 'upheld' },
                { label: '申诉驳回（维持原判）', value: 'rejected' },
              ]}
            />
          </Form.Item>
          <Form.Item label="处理备注" name="note">
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
