import { useEffect, useState } from 'react';
import { describeApiError } from '@/utils/api-error';
import StepNav, { type StepDef } from './StepNav';
import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
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
  TimeSlot,
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
  listSalaries,
} from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import DynamicFormFields from '@/components/form/DynamicFormFields';
import AskAIChip from '@/components/ai/AskAIChip';
import TimeSlotsEditor, {
  timeSlotsToApi,
  type TimeSlotFormValue,
} from './TimeSlotsEditor';
import DashboardTab from './DashboardTab';
import EmployerSelect from './EmployerSelect';
import EmployersTab from './EmployersTab';
import PreferenceTab from './PreferenceTab';
import SalariesTab from './SalariesTab';
import YearSettingsTab from './YearSettingsTab';
import styles from './index.module.css';

const { TextArea } = Input;

const POSITION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_approval: '审批中',
  open: '招聘中',
  closed: '已关闭',
};
const POSITION_STATUS_COLORS: Record<string, string> = {
  draft: '#8c8c8c',
  pending_approval: '#faad14',
  open: '#52c41a',
  closed: '#bfbfbf',
};

const APP_STATUS_LABELS: Record<string, string> = {
  pending: '审批中',
  recommended: '已推荐',     // 旧 v1 数据兼容
  hired: '已录用',
  rejected: '未通过',
};
const APP_STATUS_COLORS: Record<string, string> = {
  pending: '#1677ff',
  recommended: '#faad14',
  hired: '#52c41a',
  rejected: '#ff4d4f',
};

/** 岗位类型 — 与后端 position_type 对齐 */
const TYPE_OPTIONS = [
  { label: '固定岗', value: 'fixed' },
  { label: '临时岗', value: 'temporary' },
];

/** 困难等级 — 对齐 student_profile.aid_level + position.aid_levels */
const AID_OPTIONS = [
  { label: '特别困难', value: 'special' },
  { label: '困难', value: 'difficult' },
  { label: '一般困难', value: 'mild' },
  { label: '不困难', value: 'none' },
];

const SALARY_UNIT_OPTIONS = [
  { label: '元 / 时', value: 'hour' },
  { label: '元 / 天', value: 'day' },
  { label: '元 / 月', value: 'month' },
  { label: '元 / 次', value: 'per_task' },
];

const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];

const SALARY_UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

const PAGE_SIZE = 20;

type Tab = 'dashboard' | 'preference' | 'positions' | 'applications' | 'employers' | 'salaries' | 'year_settings';

/** Role-aware workflow ordering. Each role sees the steps in the order they
 *  naturally do them — staff start with employer setup, employers start with
 *  their own positions, students start with finding a position. */
const STAFF_STEPS: StepDef<Tab>[] = [
  { value: 'dashboard',     n: 1, title: '总览',     hint: '今日待办速览' },
  { value: 'employers',     n: 2, title: '用人单位', hint: '先把单位建好' },
  { value: 'year_settings', n: 3, title: '学年配置', hint: '设当年招岗规则' },
  { value: 'positions',     n: 4, title: '岗位审批', hint: '审 / 管在招岗位' },
  { value: 'applications',  n: 5, title: '申请审批', hint: '把候选人审完' },
  { value: 'salaries',      n: 6, title: '薪资审批', hint: '月底薪酬复核' },
];
const EMPLOYER_STEPS: StepDef<Tab>[] = [
  { value: 'dashboard',    n: 1, title: '总览',     hint: '本单位概况' },
  { value: 'positions',    n: 2, title: '岗位',     hint: '发布 / 维护本单位岗位' },
  { value: 'applications', n: 3, title: '申请审批', hint: '审本单位收到的申请' },
  { value: 'salaries',     n: 4, title: '薪资申报', hint: '本月工资单' },
];
const STUDENT_STEPS: StepDef<Tab>[] = [
  { value: 'dashboard',    n: 1, title: '总览',     hint: '看一下我的进度' },
  { value: 'preference',   n: 2, title: '偏好设置', hint: '课表 + 岗位偏好' },
  { value: 'positions',    n: 3, title: '找岗位',   hint: '按你的偏好筛选' },
  { value: 'applications', n: 4, title: '我的申请', hint: '看审批 / 录用结果' },
];

export default function WorkStudyManagement() {
  const queryClient = useQueryClient();
  const { isStudent, isEmployer, hasPermission } = useAuth();
  // 多 persona 页：isStudent/isEmployer 决定步骤集 / 数据 scope（视角层），
  // 实际动作按钮按权限码 gate（能力层）。校院级 college_admin 只有 umbrella
  // workstudy:manage 而无 granular 码，新逻辑下不会再误显「发布/关闭/处理」按钮。
  const canSetupPos = hasPermission('workstudy:position:setup');
  const canManagePos = hasPermission('workstudy:position:manage');
  const canApproveApp = hasPermission('workstudy:position:approve');

  // Pending-count badges on approval steps. Backend already scopes results by
  // role (employer sees only their unit's apps, etc.), so the same queries
  // work for staff & employer. Disabled for students — their tabs aren't
  // approval actions. Refetch every 60s so counts feel live.
  const pendingPositionsQ = useQuery({
    queryKey: ['ws-step-badge-positions'],
    queryFn: () => listPositions({ page: 1, size: 1, status: 'pending_approval' }),
    enabled: !isStudent && !isEmployer,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const pendingAppsQ = useQuery({
    queryKey: ['ws-step-badge-apps'],
    queryFn: () => listApplications({ page: 1, size: 1, status: 'pending' }),
    enabled: !isStudent,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const pendingSalariesQ = useQuery({
    queryKey: ['ws-step-badge-salaries'],
    queryFn: () => listSalaries({ page: 1, size: 1, status: 'pending' }),
    enabled: !isStudent && !isEmployer,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const baseSteps = isStudent ? STUDENT_STEPS : isEmployer ? EMPLOYER_STEPS : STAFF_STEPS;
  const stepBadges: Partial<Record<Tab, number>> = {
    positions: Number(pendingPositionsQ.data?.total ?? 0),
    applications: Number(pendingAppsQ.data?.total ?? 0),
    salaries: Number(pendingSalariesQ.data?.total ?? 0),
  };
  // Only attach a badge to steps that are genuinely approval-style for the
  // current role. Employer's "岗位" tab is "manage own positions", not approval,
  // so no badge there. Same for "薪资申报" (employer submits, doesn't approve).
  const APPROVAL_STEPS: Record<'staff' | 'employer', Tab[]> = {
    staff: ['positions', 'applications', 'salaries'],
    employer: ['applications'],
  };
  const role: 'staff' | 'employer' | 'student' = isStudent ? 'student' : isEmployer ? 'employer' : 'staff';
  const approvalSet = role === 'student' ? new Set<Tab>() : new Set(APPROVAL_STEPS[role]);
  const steps: StepDef<Tab>[] = baseSteps.map((s) =>
    approvalSet.has(s.value) ? { ...s, badge: stepBadges[s.value] } : s,
  );

  const [tab, setTab] = useState<Tab>('dashboard');
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string | undefined>();

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
    queryKey: ['wsPositions', page, isStudent, yearFilter],
    queryFn: () =>
      listPositions({
        page,
        size: PAGE_SIZE,
        status: isStudent ? 'open' : undefined,
        studentScope: isStudent ? true : undefined,
        academic_year: yearFilter,
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
    onError: (e: unknown) => message.error(describeApiError(e, '发布失败，请重试')),
  });

  const closeMutation = useMutation({
    mutationFn: closePosition,
    onSuccess: () => {
      message.success('岗位已关闭');
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '关闭失败')),
  });

  const applyMutation = useMutation({
    mutationFn: apply,
    onSuccess: () => {
      message.success('申请已提交');
      setApplyPosition(null);
      applyForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '申请失败（是否已申请过？）')),
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
    onError: (e: unknown) => message.error(describeApiError(e, '处理失败，请重试')),
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
        hourly_rate: v.hourly_rate != null ? String(v.hourly_rate) : undefined,
        weekly_hours: v.weekly_hours,
        headcount: v.headcount,
        start_date: v.start_date ? (v.start_date as Dayjs).format('YYYY-MM-DD') : undefined,
        end_date: v.end_date ? (v.end_date as Dayjs).format('YYYY-MM-DD') : undefined,
        // V051 fields
        academic_year: v.academic_year || undefined,
        employer_id: v.employer_id ? String(v.employer_id) : undefined,
        owner_user_id: v.owner_user_id ? String(v.owner_user_id) : undefined,
        owner_phone: v.owner_phone || undefined,
        campus: v.campus || undefined,
        work_location: v.work_location || undefined,
        duration_months: v.duration_months,
        application_deadline: v.application_deadline
          ? (v.application_deadline as Dayjs).toISOString()
          : undefined,
        time_slots: timeSlotsToApi(v.time_slots as TimeSlotFormValue[] | undefined),
        salary_unit: v.salary_unit,
        salary_amount: v.salary_amount != null ? String(v.salary_amount) : undefined,
        reason: v.reason || undefined,
        gender_limit: v.gender_limit,
        aid_levels: v.aid_levels,
        grade_limits: v.grade_limits
          ? String(v.grade_limits)
              .split(/[,，\s]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      });
    });
  };

  const handleApply = () => {
    if (!applyPosition) return;
    applyForm.validateFields().then((v) => {
      const schemaExtra = (v as Record<string, unknown>)._extra;
      const extra_data =
        schemaExtra && typeof schemaExtra === 'object'
          ? (schemaExtra as Record<string, unknown>)
          : undefined;
      applyMutation.mutate({
        position_id: applyPosition.id,
        financial_aid_level: v.financial_aid_level,
        intro: v.intro,
        extra_data,
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
      title: '校区',
      dataIndex: 'campus',
      width: 100,
      render: (v: string | null) => v ?? <span style={{ color: 'var(--fg-4)' }}>—</span>,
    },
    {
      title: '薪资',
      key: 'salary',
      width: 130,
      render: (_, r) => {
        const amount = r.salary_amount ?? r.hourly_rate;
        const unit = r.salary_unit ?? 'hour';
        if (!amount) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
        return `¥${Number(amount).toFixed(2)} / ${SALARY_UNIT_LABEL[unit] ?? '时'}`;
      },
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
      width: 220,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setPositionDetail(r)}>查看</button>
          {canApproveApp && (
            <AskAIChip
              size="small"
              className={styles.actionAskAi}
              label="对比卡"
              tooltip="把该岗位的所有申请压成候选人对比卡"
              autoSend
              refData={{
                type: 'workstudy_position',
                id: String(r.id),
                label: r.title,
                detail: `${r.title}（${r.position_type === 'fixed' ? '固定岗' : '临时岗'}，已招 ${r.hired_count ?? 0}/${r.headcount ?? '?'}）`,
              }}
              prompt="用 summarize_workstudy_applicants 把岗位 #{id} 的所有申请压成候选对比卡"
            />
          )}
          {isStudent && r.status === 'open' && (
            <button
              className={styles.actionLink}
              style={{ marginLeft: 12 }}
              onClick={() => setApplyPosition(r)}
            >
              申请
            </button>
          )}
          {canManagePos && r.status === 'open' && (
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
        canApproveApp && (r.status === 'pending' || r.status === 'recommended') ? (
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
        {canSetupPos && (
          <Button type="primary" onClick={() => setCreateOpen(true)}>发布岗位</Button>
        )}
      </div>

      <StepNav
        steps={steps}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />

      <div className={styles.tableCard}>
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'preference' && <PreferenceTab />}
        {tab === 'positions' && (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
              <Input
                placeholder="按学年筛选 (如 2024-2025)"
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value || undefined);
                  setPage(1);
                }}
                allowClear
                style={{ maxWidth: 220 }}
              />
            </div>
            <Table<WorkStudyPosition>
              rowKey="id"
              columns={positionColumns}
              dataSource={positionsQuery.data?.data ?? []}
              loading={positionsQuery.isFetching}
              pagination={paginationProps(Number(positionsQuery.data?.total ?? 0))}
              size="middle"
            />
          </>
        )}
        {tab === 'applications' && (
          <Table<WorkStudyApplication>
            rowKey="id"
            columns={applicationColumns}
            dataSource={applicationsQuery.data?.data ?? []}
            loading={applicationsQuery.isFetching}
            pagination={paginationProps(Number(applicationsQuery.data?.total ?? 0))}
            size="middle"
          />
        )}
        {tab === 'employers' && <div style={{ padding: 16 }}><EmployersTab /></div>}
        {tab === 'salaries' && <div style={{ padding: 16 }}><SalariesTab /></div>}
        {tab === 'year_settings' && <div style={{ padding: 16 }}><YearSettingsTab /></div>}
      </div>

      {/* Position detail drawer */}
      <Drawer
        title="岗位详情"
        open={positionDetail !== null}
        onClose={() => setPositionDetail(null)}
        width={560}
      >
        {positionDetail && <PositionDetailBody p={positionDetail} />}
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
        <Form
          form={createForm}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{ prefer_financial_aid: false, position_type: 'fixed', salary_unit: 'hour' }}
        >
          <Divider orientation="left" plain>基本信息</Divider>
          <Form.Item label="岗位名称" name="title" rules={[{ required: true, message: '请输入岗位名称' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="学年" name="academic_year" tooltip="如 2024-2025">
            <Input placeholder="2024-2025" maxLength={16} />
          </Form.Item>
          <Form.Item label="用人单位" name="employer_id">
            <EmployerSelect />
          </Form.Item>
          <Form.Item label="用人部门（旧字段）" name="department_name">
            <Input maxLength={100} placeholder="兼容旧数据，新岗位优先填用人单位 ID" />
          </Form.Item>
          <Form.Item label="岗位类型" name="position_type">
            <Radio.Group options={TYPE_OPTIONS} optionType="button" />
          </Form.Item>

          <Divider orientation="left" plain>负责人 & 地点</Divider>
          <Form.Item label="岗位负责人 ID" name="owner_user_id" tooltip="学生申请时由该负责人审核">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="负责人联系电话" name="owner_phone">
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item label="校区" name="campus">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="工作地点" name="work_location">
            <Input maxLength={200} />
          </Form.Item>

          <Divider orientation="left" plain>薪资 & 工时</Divider>
          <Form.Item label="薪资单位" name="salary_unit">
            <Radio.Group options={SALARY_UNIT_OPTIONS} optionType="button" />
          </Form.Item>
          <Form.Item label="薪资金额" name="salary_amount" tooltip="按所选单位的单价">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="时薪（旧字段）" name="hourly_rate" tooltip="兼容旧数据，留空时用上面的薪资单位/金额">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="周工时上限" name="weekly_hours">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="持续时间（月）" name="duration_months">
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
          <Form.Item label="申请截止时间" name="application_deadline">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="工作时间段"
            tooltip="排班时段；学生用 AI 按空余时间匹配岗位时会用到"
          >
            <TimeSlotsEditor name="time_slots" />
          </Form.Item>

          <Divider orientation="left" plain>申请条件</Divider>
          <Form.Item label="性别限制" name="gender_limit">
            <Radio.Group options={[...GENDER_OPTIONS, { label: '不限', value: undefined as unknown as string }]} optionType="button" />
          </Form.Item>
          <Form.Item label="允许的困难等级" name="aid_levels" tooltip="留空表示不限">
            <Select mode="multiple" options={AID_OPTIONS} placeholder="留空=不限" allowClear />
          </Form.Item>
          <Form.Item label="允许的年级" name="grade_limits" tooltip="逗号分隔，如 2023,2024">
            <Input placeholder="2023,2024（留空=不限）" />
          </Form.Item>
          <Form.Item name="prefer_financial_aid" valuePropName="checked">
            <Checkbox>优先录用家庭经济困难学生（旧字段）</Checkbox>
          </Form.Item>

          <Divider orientation="left" plain>描述</Divider>
          <Form.Item label="岗位描述" name="description" rules={[{ required: true, message: '请输入岗位描述' }]}>
            <TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="任职要求" name="requirements">
            <TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item label="设岗理由" name="reason">
            <TextArea rows={2} maxLength={1000} />
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
          <DynamicFormFields bizType="workstudy_application" fieldNamePrefix={['_extra']} />
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
            <Radio.Group
              options={[
                { label: '录用', value: 'hired' },
                { label: '拒绝', value: 'rejected' },
              ]}
              optionType="button"
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

const DAY_LABEL: Record<string, string> = {
  mon: '周一', tue: '周二', wed: '周三', thu: '周四',
  fri: '周五', sat: '周六', sun: '周日',
};

function asArray<T>(raw: T[] | string | null | undefined): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function PositionDetailBody({ p }: { p: WorkStudyPosition }) {
  const pinRef = useAIActionStore((s) => s.pinRef);
  const slots = asArray<TimeSlotForRender>(
    p.time_slots as TimeSlot[] | string | null | undefined,
  );
  const aidLevels = asArray<string>(p.aid_levels);
  const gradeLimits = asArray<string>(p.grade_limits);
  const collegeLimits = asArray<string | number>(p.college_limits);

  const salary = p.salary_amount
    ? `¥${Number(p.salary_amount).toFixed(2)} / ${SALARY_UNIT_LABEL[p.salary_unit ?? 'hour'] ?? '时'}`
    : p.hourly_rate
    ? `¥${Number(p.hourly_rate).toFixed(2)} / 时（旧字段）`
    : '—';

  const handlePin = () => {
    pinRef({
      type: 'workstudy_position',
      id: String(p.id),
      label: p.title,
      detail: `${p.title}（${p.position_type === 'fixed' ? '固定岗' : '临时岗'}，已招 ${p.hired_count ?? 0}/${p.headcount ?? '?'}）`,
    });
    message.success('已 Pin 到 AI 面板，可使用"候选对比卡"等快捷键');
  };

  return (
    <div className={styles.drawerBody}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" type="primary" ghost onClick={handlePin}>
          📌 Pin 到 AI 面板
        </Button>
      </div>
      <Field label="岗位" value={p.title} />
      <Field label="学年" value={p.academic_year ?? '—'} />
      <Field
        label="用人单位"
        value={p.employer_id ? `#${p.employer_id}` : p.department_name || '—'}
      />
      <Field
        label="类型"
        value={TYPE_OPTIONS.find((o) => o.value === p.position_type)?.label ?? p.position_type ?? '—'}
      />
      <Field label="校区" value={p.campus ?? '—'} />
      <Field label="工作地点" value={p.work_location ?? '—'} />
      <Field
        label="负责人"
        value={
          p.owner_user_id
            ? `#${p.owner_user_id}${p.owner_phone ? `（${p.owner_phone}）` : ''}`
            : '—'
        }
      />
      <Field label="薪资" value={salary} />
      <Field label="周工时" value={p.weekly_hours ? `${p.weekly_hours} 小时` : '—'} />
      <Field label="持续时间" value={p.duration_months ? `${p.duration_months} 个月` : '—'} />
      <Field
        label="招聘人数"
        value={p.headcount ? `${p.hired_count ?? 0} / ${p.headcount}` : '—'}
      />
      <Field
        label="起止日期"
        value={
          p.start_date || p.end_date
            ? `${p.start_date ?? '—'} 至 ${p.end_date ?? '长期'}`
            : '—'
        }
      />
      <Field
        label="申请截止"
        value={p.application_deadline ? dayjs(p.application_deadline).format('YYYY-MM-DD HH:mm') : '—'}
      />
      <Field
        label="工作时间段"
        value={
          slots.length === 0 ? (
            '不限'
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {slots.map((s, i) => (
                <span key={i}>
                  {DAY_LABEL[s.day] ?? s.day} {s.start} - {s.end}
                </span>
              ))}
            </div>
          )
        }
      />
      <Field
        label="申请条件"
        value={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {p.gender_limit && (
              <Tag>性别：{p.gender_limit === 'male' ? '男' : '女'}</Tag>
            )}
            {aidLevels.length > 0 && (
              <Tag>困难等级：{aidLevels.map((l) => AID_OPTIONS.find((o) => o.value === l)?.label ?? l).join('/')}</Tag>
            )}
            {gradeLimits.length > 0 && <Tag>年级：{gradeLimits.join('/')}</Tag>}
            {collegeLimits.length > 0 && <Tag>学院：{collegeLimits.join(',')}</Tag>}
            {p.prefer_financial_aid && <Tag color="blue">优先困难生</Tag>}
            {p.self_arranged && <Tag color="orange">单位内部安排</Tag>}
            {!p.gender_limit && aidLevels.length === 0 && gradeLimits.length === 0
              && collegeLimits.length === 0 && !p.prefer_financial_aid && !p.self_arranged && (
              <span style={{ color: 'var(--fg-4)' }}>无</span>
            )}
          </div>
        }
      />
      <Field
        label="岗位描述"
        value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{p.description}</pre>}
      />
      {p.requirements && (
        <Field
          label="任职要求"
          value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{p.requirements}</pre>}
        />
      )}
      {p.reason && (
        <Field
          label="设岗理由"
          value={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{p.reason}</pre>}
        />
      )}
    </div>
  );
}

type TimeSlotForRender = { day: string; start: string; end: string };

