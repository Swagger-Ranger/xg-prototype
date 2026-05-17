import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { describeApiError } from '@/utils/api-error';
import StepNav, { type StepDef } from './StepNav';
import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Radio,
  Segmented,
  Select,
  Table,
  Tag,
  message,
} from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DecisionData,
  PositionRecommendation,
  TimeSlot,
  WorkStudyApplication,
  WorkStudyPosition,
} from '@/api/workStudy';
import {
  apply,
  batchNotifyApplications,
  batchOffboardApplications,
  closePosition,
  createPosition,
  decideApplication,
  draftApplyIntro,
  draftInterviewNotice,
  exportApplicationsCurrentView,
  exportWorkstudyByDsl,
  getMyRecommendedPositions,
  getPosition,
  listApplications,
  listPositions,
  listSalaries,
  nlToWorkstudyReport,
  offboardByEmployer,
  offboardByStudent,
  scheduleInterview,
  setPositionAcceptingApplications,
  WORKSTUDY_REPORT_COLUMNS,
} from '@/api/workStudy';
import type { NlToReportResp, WorkStudyReportDsl } from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import DynamicFormFields from '@/components/form/DynamicFormFields';
import InstanceTimeline from '@/components/workflow/InstanceTimeline';
import TimeSlotsEditor, {
  timeSlotsToApi,
  type TimeSlotFormValue,
} from './TimeSlotsEditor';
import DashboardTab from './DashboardTab';
import EmployerSelect from './EmployerSelect';
import OwnerUserSelect from './OwnerUserSelect';
import ApplicantCompareDrawer from './ApplicantCompareDrawer';
import EmployersTab from './EmployersTab';
import PreferenceTab from './PreferenceTab';
import SalariesTab from './SalariesTab';
import BusinessConfigTab from './BusinessConfigTab';
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

const OFFBOARD_REASON_LABELS: Record<string, string> = {
  completed: '任期到期',
  terminated_by_employer: '单位终止',
  resigned_by_student: '主动离岗',
};

const AID_POLICY_LABELS: Record<string, string> = {
  none: '不倾斜',
  bonus: '困难加分',
  reserved: '困难保底',
  only: '仅限困难生',
};

const AID_POLICY_COLORS: Record<string, string> = {
  bonus: 'blue',
  reserved: 'gold',
  only: 'magenta',
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

type Tab = 'dashboard' | 'preference' | 'positions' | 'applications' | 'employers' | 'salaries' | 'business_config';

/** Role-aware workflow ordering. Each role sees the steps in the order they
 *  naturally do them — staff start with employer setup, employers start with
 *  their own positions, students start with finding a position. */
const STAFF_STEPS: StepDef<Tab>[] = [
  { value: 'dashboard',     n: 1, title: '总览',     hint: '今日待办速览' },
  { value: 'employers',     n: 2, title: '用人单位 / 资助中心', hint: '先把单位建好' },
  { value: 'positions',     n: 3, title: '岗位审批', hint: '审 / 管在招岗位' },
  { value: 'applications',  n: 4, title: '申请审批', hint: '把候选人审完' },
  { value: 'salaries',      n: 5, title: '薪资审批', hint: '月底薪酬复核' },
];
// school_admin 专属:学年规则 + 三阶段时间窗 + 审批工作流 统一管理(仿请假规则页样式)。
// 后端 requireDefinitionAdmin 是 school_admin gate,前端先把入口隐藏防止 staff 误点 403。
const BUSINESS_CONFIG_STEP: StepDef<Tab> = {
  value: 'business_config', n: 6, title: '业务配置', hint: '学年规则 / 时段 / 审批流',
};
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
  { value: 'salaries',     n: 5, title: '我的薪资', hint: '审核中 / 已确认 / 到账' },
];

export default function WorkStudyManagement() {
  const queryClient = useQueryClient();
  const { isStudent, isEmployer, isAdmin, hasPermission, user } = useAuth();
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

  // school_admin 视角:把"业务配置"插到"用人单位"之后(步骤 3 位置),让规则在
  // 跑业务前就配好,后面的岗位审批/申请审批/薪资审批顺位后挪。其他角色不受影响。
  const baseSteps = isStudent
    ? STUDENT_STEPS
    : isEmployer
      ? EMPLOYER_STEPS
      : isAdmin
        ? [
            STAFF_STEPS[0],                              // 1 总览
            STAFF_STEPS[1],                              // 2 用人单位
            { ...BUSINESS_CONFIG_STEP, n: 3 },           // 3 业务配置
            { ...STAFF_STEPS[2], n: 4 },                 // 4 岗位审批
            { ...STAFF_STEPS[3], n: 5 },                 // 5 申请审批
            { ...STAFF_STEPS[4], n: 6 },                 // 6 薪资审批
          ]
        : STAFF_STEPS;
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

  // ?tab=xxx 由 AI 小夕 navigate 时透传(如 navigate(page=work-study, tab=business_config))。
  // 仅 baseSteps 里存在的 tab 才接受,避免脏 URL 把视图打到不该看的 tab。
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const initialTab: Tab = urlTab && baseSteps.some((s) => s.value === urlTab) ? urlTab : 'dashboard';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string | undefined>();
  // 学生总览卡片点击 → 跳到「我的申请」并按状态/在岗过滤。空 = 不过滤。
  // engagementFilter='on_duty' 用来把"已录用"卡片切到只看在岗记录。
  const [appsStatusFilter, setAppsStatusFilter] = useState<string | undefined>();
  const [appsEngagementFilter, setAppsEngagementFilter] = useState<'on_duty' | undefined>();
  // P3.A 学生「我的申请」分段切换：在岗中 / 审批中 / 历史
  // staff/employer 不显示这个 Segmented（他们看全量表）。
  type StudentAppSegment = 'on_duty' | 'pending' | 'history';
  const [studentAppSegment, setStudentAppSegment] = useState<StudentAppSegment>('on_duty');

  const [createOpen, setCreateOpen] = useState(false);
  const [applyPosition, setApplyPosition] = useState<WorkStudyPosition | null>(null);
  const [decideRecord, setDecideRecord] = useState<WorkStudyApplication | null>(null);
  const [positionDetail, setPositionDetail] = useState<WorkStudyPosition | null>(null);
  // 「对比卡」打开的岗位 — null = 关闭。同时只展开一张候选对比 Drawer。
  const [comparePosition, setComparePosition] = useState<WorkStudyPosition | null>(null);
  const [offboardRecord, setOffboardRecord] = useState<{
    app: WorkStudyApplication;
    mode: 'employer' | 'student';
  } | null>(null);
  const [interviewRecord, setInterviewRecord] = useState<{
    app: WorkStudyApplication;
    position: WorkStudyPosition;
  } | null>(null);
  const [selectedAppKeys, setSelectedAppKeys] = useState<React.Key[]>([]);
  const [selectedAppRows, setSelectedAppRows] = useState<WorkStudyApplication[]>([]);
  const [batchOffboardOpen, setBatchOffboardOpen] = useState(false);
  const [batchNotifyOpen, setBatchNotifyOpen] = useState(false);
  const [aiReportOpen, setAiReportOpen] = useState(false);
  const [aiReportNl, setAiReportNl] = useState('');
  const [aiReportDsl, setAiReportDsl] = useState<NlToReportResp | null>(null);

  const [createForm] = Form.useForm();
  // 跟随用户单位变化，决定「岗位负责人」下拉的候选池
  const createEmployerId = Form.useWatch('employer_id', createForm);
  const [applyForm] = Form.useForm();
  const [decideForm] = Form.useForm();
  const [offboardForm] = Form.useForm();
  const [interviewForm] = Form.useForm();
  const [batchOffboardForm] = Form.useForm();
  const [batchNotifyForm] = Form.useForm();

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

  // B3 — 学生侧 AI 推荐 Top 5；只在学生看 positions 时拉
  const recommendationsQuery = useQuery({
    queryKey: ['wsRecommendations'],
    queryFn: () => getMyRecommendedPositions(5),
    enabled: tab === 'positions' && isStudent,
    staleTime: 60_000,
  });

  // Applications query: students see own; admins see all。
  // include=position 让后端 join 岗位摘要，学生才能看到"岗位 ID=423"是什么。
  // status / engagement 过滤来自总览卡片跳转；engagement 走前端过滤（后端列表 API
  // 暂未加该参数，数据量小不会有问题）。
  // P3.A 学生 Segmented 分段过滤需要拿到全量记录算 badge，因此把 size 提到 200
  // 把单学生的历史申请一次拉完（学生一般 < 50 条）；staff/employer 仍走分页。
  const studentAppPageSize = 200;
  const applicationsQuery = useQuery({
    queryKey: ['wsApplications', page, appsStatusFilter, appsEngagementFilter, isStudent],
    queryFn: () =>
      listApplications({
        page: isStudent ? 1 : page,
        size: isStudent ? studentAppPageSize : PAGE_SIZE,
        include: 'position',
        // 学生侧：Segmented 自己在前端过滤，不再传 status；staff 仍用筛选 chip。
        status: isStudent ? undefined : appsStatusFilter,
        // 「在岗学生」卡片跳转过来时给后端透传，避免分页错过在岗行。
        engagementStatus: isStudent ? undefined : appsEngagementFilter,
      }),
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

  const acceptingMutation = useMutation({
    mutationFn: ({ id, accepting, reason }: { id: string; accepting: boolean; reason?: string }) =>
      setPositionAcceptingApplications(id, accepting, reason),
    onSuccess: (_, vars) => {
      message.success(vars.accepting ? '已恢复招新' : '已暂停招新');
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '切换失败')),
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

  const offboardMutation = useMutation({
    mutationFn: async ({
      id,
      mode,
      reason,
      dismissalCategory,
      note,
    }: {
      id: string;
      mode: 'employer' | 'student';
      reason?: 'completed' | 'terminated_by_employer';
      dismissalCategory?:
        | 'performance'
        | 'discipline'
        | 'position_dissolved'
        | 'mismatch'
        | 'other';
      note?: string;
    }) => {
      if (mode === 'employer') {
        await offboardByEmployer(id, { reason, dismissalCategory, note });
      } else {
        await offboardByStudent(id, { note });
      }
    },
    onSuccess: () => {
      message.success('已离岗');
      setOffboardRecord(null);
      offboardForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '离岗操作失败，请重试')),
  });

  const handleOffboard = () => {
    if (!offboardRecord) return;
    offboardForm.validateFields().then((v) => {
      const isEmployer = offboardRecord.mode === 'employer';
      const reason = isEmployer ? v.reason : undefined;
      offboardMutation.mutate({
        id: offboardRecord.app.id,
        mode: offboardRecord.mode,
        reason,
        // 只有"单位终止"路径才透传子分类；任期到期 / 学生离职不带
        dismissalCategory:
          isEmployer && reason === 'terminated_by_employer' ? v.dismissalCategory : undefined,
        note: v.note,
      });
    });
  };

  // 从「我的申请 / 申请列表」点岗位名 → 拉完整岗位详情打开 Drawer。
  // 学生点录用后想看"工作地点 / 联系人"也走这里。
  const openPositionFromApplication = async (app: WorkStudyApplication) => {
    try {
      const pos = await getPosition(app.position_id);
      setPositionDetail(pos);
    } catch (e) {
      message.error(describeApiError(e, '加载岗位详情失败'));
    }
  };

  // B2 面试通知：打开 Modal 需先拿到 position 详情（用于 AI 起草上下文）
  const openInterviewModal = async (app: WorkStudyApplication) => {
    try {
      const pos = await getPosition(app.position_id);
      interviewForm.resetFields();
      interviewForm.setFieldsValue({
        interview_at: app.interview_at ? dayjs(app.interview_at) : null,
        interview_location: app.interview_location ?? '',
        interview_notes: app.interview_notes ?? '',
        body: '',
      });
      setInterviewRecord({ app, position: pos });
    } catch (e) {
      message.error(describeApiError(e, '加载岗位信息失败'));
    }
  };

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      if (!interviewRecord) throw new Error('no interview record');
      const v = interviewForm.getFieldsValue();
      if (!v.interview_at || !v.interview_location) {
        throw new Error('请先填写面试时间和地点');
      }
      return draftInterviewNotice({
        student_name: interviewRecord.app.student_name,
        position_title: interviewRecord.position.title,
        department_name: interviewRecord.position.department_name ?? undefined,
        interview_at: (v.interview_at as Dayjs).format('YYYY-MM-DD HH:mm'),
        interview_location: v.interview_location,
        employer_note: v.interview_notes || undefined,
      });
    },
    onSuccess: (resp) => {
      if (resp.draft) {
        interviewForm.setFieldsValue({ body: resp.draft });
        if (resp.error_message) {
          message.warning('AI 起草遇到问题：' + resp.error_message);
        } else {
          message.success('AI 已生成，可继续编辑');
        }
      } else {
        message.error(resp.error_message || 'AI 未返回内容');
      }
    },
    onError: (e: unknown) => message.error(describeApiError(e, 'AI 起草失败')),
  });

  // P2.1 申请自荐 AI 起草 — 不依赖 student_profile API（FE 没现成接口取年级/学院）；
  // 只用 useAuth().user.real_name + applyPosition 的岗位信息。LLM 提示词被约束为
  // "不要编造没给的事实"，避免幻觉。
  const aiApplyIntroMutation = useMutation({
    mutationFn: async () => {
      if (!applyPosition) throw new Error('no apply target');
      const studentName = user?.real_name || user?.username || '同学';
      return draftApplyIntro({
        student_name: studentName,
        position_title: applyPosition.title,
        department_name: applyPosition.department_name ?? undefined,
        position_type: applyPosition.position_type ?? undefined,
        position_description: applyPosition.description ?? undefined,
      });
    },
    onSuccess: (resp) => {
      if (resp.draft) {
        applyForm.setFieldsValue({ intro: resp.draft });
        if (resp.error_message) {
          message.warning('AI 起草遇到问题：' + resp.error_message);
        } else {
          message.success('AI 已生成，可继续编辑');
        }
      } else {
        message.error(resp.error_message || 'AI 未返回内容');
      }
    },
    onError: (e: unknown) => message.error(describeApiError(e, 'AI 起草失败')),
  });

  const interviewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof scheduleInterview>[1] }) =>
      scheduleInterview(id, data),
    onSuccess: () => {
      message.success('面试通知已发送');
      setInterviewRecord(null);
      interviewForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '发送失败')),
  });

  const handleSendInterview = () => {
    if (!interviewRecord) return;
    interviewForm.validateFields().then((v) => {
      interviewMutation.mutate({
        id: interviewRecord.app.id,
        data: {
          interview_at: (v.interview_at as Dayjs).toISOString(),
          interview_location: v.interview_location,
          interview_notes: v.interview_notes || undefined,
          body: v.body,
        },
      });
    });
  };

  // A3 批量动作 —— 二次确认 = Modal 标题里"影响 X 人"+ 提交按钮 danger 风格
  const onDutyCount = selectedAppRows.filter((r) => r.engagement_status === 'on_duty').length;

  const clearSelection = () => {
    setSelectedAppKeys([]);
    setSelectedAppRows([]);
  };

  const summarizeBatchResult = (r: { succeeded: number; skipped: number; failures: unknown[] }) => {
    const parts = [`成功 ${r.succeeded}`];
    if (r.skipped > 0) parts.push(`跳过 ${r.skipped}`);
    if (r.failures.length > 0) parts.push(`失败 ${r.failures.length}`);
    return parts.join(' / ');
  };

  const batchOffboardMutation = useMutation({
    mutationFn: batchOffboardApplications,
    onSuccess: (resp) => {
      message.success(`批量终止完成：${summarizeBatchResult(resp)}`);
      setBatchOffboardOpen(false);
      batchOffboardForm.resetFields();
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['wsApplications'] });
      queryClient.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '批量终止失败')),
  });

  const batchNotifyMutation = useMutation({
    mutationFn: batchNotifyApplications,
    onSuccess: (resp) => {
      message.success(`通知已发送：${summarizeBatchResult(resp)}`);
      setBatchNotifyOpen(false);
      batchNotifyForm.resetFields();
      clearSelection();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '批量发通知失败')),
  });

  const handleBatchOffboard = () => {
    batchOffboardForm.validateFields().then((v) => {
      const ids = selectedAppRows
        .filter((r) => r.engagement_status === 'on_duty')
        .map((r) => r.id);
      if (ids.length === 0) {
        message.warning('选中行里没有在岗学生');
        return;
      }
      batchOffboardMutation.mutate({
        application_ids: ids,
        reason: v.reason,
        // 与单条逻辑一致：只有"单位终止"路径才透传子分类
        dismissalCategory:
          v.reason === 'terminated_by_employer' ? v.dismissalCategory : undefined,
        note: v.note || undefined,
      });
    });
  };

  const handleBatchNotify = () => {
    batchNotifyForm.validateFields().then((v) => {
      batchNotifyMutation.mutate({
        application_ids: selectedAppRows.map((r) => r.id),
        title: v.title,
        body: v.body,
      });
    });
  };

  // A4 导出当前视图 — 与当前列表查询参数对齐
  const exportCurrentViewMutation = useMutation({
    mutationFn: () =>
      exportApplicationsCurrentView({ page: 1, size: 5000 }),
    onSuccess: () => message.success('导出已开始下载'),
    onError: (e: unknown) => message.error(describeApiError(e, '导出失败')),
  });

  // A4 AI 报表：NL → DSL → 预览 → 下载（两阶段）
  const aiReportParseMutation = useMutation({
    mutationFn: async () => {
      if (!aiReportNl.trim()) throw new Error('请先输入报表需求');
      return nlToWorkstudyReport({
        query: aiReportNl.trim(),
        today: dayjs().format('YYYY-MM-DD'),
        allowed_columns: WORKSTUDY_REPORT_COLUMNS.map((c) => c.key),
      });
    },
    onSuccess: (resp) => {
      setAiReportDsl(resp);
      if (resp.error_message) message.warning('AI 解析遇到问题：' + resp.error_message);
    },
    onError: (e: unknown) => message.error(describeApiError(e, 'AI 解析失败')),
  });

  const aiReportExportMutation = useMutation({
    mutationFn: (dsl: WorkStudyReportDsl) => exportWorkstudyByDsl(dsl),
    onSuccess: () => {
      message.success('报表已下载');
      setAiReportOpen(false);
      setAiReportNl('');
      setAiReportDsl(null);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '下载失败')),
  });

  /** B1-复制：把源岗位的字段灌进发布表单，复用现有 createPosition 流程。 */
  const handleCopyPosition = (src: WorkStudyPosition) => {
    const parseList = <T,>(raw: T[] | string | null | undefined): T[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      try {
        const parsed = JSON.parse(raw as string);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    };
    const slots = parseList<TimeSlot>(src.time_slots);
    createForm.setFieldsValue({
      title: src.title ? `${src.title}（副本）` : undefined,
      position_type: src.position_type ?? 'fixed',
      description: src.description ?? undefined,
      requirements: src.requirements ?? undefined,
      weekly_hours: src.weekly_hours ?? undefined,
      headcount: src.headcount ?? undefined,
      // 起止日期 / 截止时间不复用：复制后通常是新一轮招聘，日期应由用户重新设
      employer_id: src.employer_id ?? undefined,
      academic_year: src.academic_year ?? undefined,
      owner_user_id: src.owner_user_id ?? undefined,
      owner_phone: src.owner_phone ?? undefined,
      campus: src.campus ?? undefined,
      work_location: src.work_location ?? undefined,
      duration_months: src.duration_months ?? undefined,
      salary_unit: src.salary_unit ?? 'hour',
      salary_amount: src.salary_amount != null ? Number(src.salary_amount) : undefined,
      reason: src.reason ?? undefined,
      gender_limit: src.gender_limit ?? undefined,
      aid_levels: parseList<string>(src.aid_levels),
      grade_limits: parseList<string>(src.grade_limits).join(','),
      time_slots: slots.length > 0 ? slots : undefined,
      // B3
      financial_aid_policy: src.financial_aid_policy ?? 'none',
      reserved_count: src.reserved_count ?? undefined,
    });
    setCreateOpen(true);
  };

  const handleCreate = () => {
    createForm.validateFields().then((v) => {
      createMutation.mutate({
        title: v.title,
        position_type: v.position_type,
        description: v.description,
        requirements: v.requirements,
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
        // B3
        financial_aid_policy: v.financial_aid_policy ?? undefined,
        reserved_count: v.reserved_count ?? undefined,
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
        if (!r.salary_amount) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
        const unit = r.salary_unit ?? 'hour';
        return `¥${Number(r.salary_amount).toFixed(2)} / ${SALARY_UNIT_LABEL[unit] ?? '时'}`;
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
      title: '困难生',
      key: 'aid_policy',
      width: 110,
      render: (_, r) => {
        const policy = r.financial_aid_policy && r.financial_aid_policy !== 'none'
          ? r.financial_aid_policy
          : r.prefer_financial_aid ? 'bonus' : null;
        if (!policy) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
        const label = AID_POLICY_LABELS[policy] ?? policy;
        const extra = policy === 'reserved' && r.reserved_count ? `·${r.reserved_count}人` : '';
        return <Tag color={AID_POLICY_COLORS[policy] ?? 'default'}>{label}{extra}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: string, r) => {
        const c = POSITION_STATUS_COLORS[v] ?? '#8c8c8c';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag
              className={styles.statusTag}
              style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}40` }}
            >
              {POSITION_STATUS_LABELS[v] ?? v}
            </Tag>
            {v === 'open' && r.accepting_applications === false && (
              <Tag color="orange" style={{ margin: 0 }}>暂停招新</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, r) => {
        // 次要操作收进「⋯」Dropdown,主操作保留在外层。同样的视觉权重(plain text 链接),
        // 不再夹 AskAIChip 那种带 background+border 的异类。
        // Dropdown 自动 close-on-click,所以确认弹窗用 Modal.confirm,不用 Popconfirm。
        type MenuItem = NonNullable<NonNullable<React.ComponentProps<typeof Dropdown>['menu']>['items']>[number];
        const moreItems: MenuItem[] = [];
        if (canSetupPos) {
          moreItems.push({
            key: 'copy',
            label: '复制为模板',
            onClick: () => handleCopyPosition(r),
          });
        }
        if (canManagePos && r.status === 'open') {
          if (r.accepting_applications === false) {
            moreItems.push({
              key: 'resume',
              label: '恢复招新',
              onClick: () => Modal.confirm({
                title: '恢复后将重新接受新申请，确认？',
                okText: '恢复',
                cancelText: '取消',
                onOk: () => acceptingMutation.mutate({ id: r.id, accepting: true }),
              }),
            });
          } else {
            moreItems.push({
              key: 'pause',
              label: '暂停招新',
              onClick: () => Modal.confirm({
                title: '暂停后新申请将被拦截，已申请的不受影响，确认？',
                okText: '暂停',
                cancelText: '取消',
                onOk: () => acceptingMutation.mutate({ id: r.id, accepting: false }),
              }),
            });
          }
          moreItems.push({
            key: 'close',
            label: '关闭岗位',
            danger: true,
            onClick: () => Modal.confirm({
              title: '关闭后不再接受新申请，确认？',
              okText: '关闭',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => closeMutation.mutate(r.id),
            }),
          });
        }
        return (
          <>
            <button className={styles.actionLink} onClick={() => setPositionDetail(r)}>查看</button>
            {canApproveApp && (
              <button
                className={styles.actionLink}
                style={{ marginLeft: 12 }}
                onClick={() => setComparePosition(r)}
                title="查看本岗位所有申请,直接录用 / 拒绝"
              >
                对比卡
              </button>
            )}
            {isStudent && r.status === 'open' && r.accepting_applications !== false && (
              <button
                className={styles.actionLink}
                style={{ marginLeft: 12 }}
                onClick={() => setApplyPosition(r)}
              >
                申请
              </button>
            )}
            {moreItems.length > 0 && (
              <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
                <button
                  className={styles.actionLink}
                  style={{ marginLeft: 12 }}
                  aria-label="更多操作"
                  title="更多操作"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreOutlined />
                </button>
              </Dropdown>
            )}
          </>
        );
      },
    },
  ];

  const renderPositionCell = (r: WorkStudyApplication) => {
    const ps = r.position_summary;
    if (!ps) {
      return <span style={{ color: 'var(--fg-4)' }}>#{r.position_id}</span>;
    }
    return (
      <button
        type="button"
        className={styles.actionLink}
        style={{ textAlign: 'left', padding: 0 }}
        onClick={() => openPositionFromApplication(r)}
      >
        <div style={{ fontWeight: 500 }}>{ps.title}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
          {ps.department_name || '—'} · {ps.position_type === 'fixed' ? '固定岗' : '临时岗'}
        </div>
      </button>
    );
  };

  const renderSalaryCell = (r: WorkStudyApplication) => {
    const ps = r.position_summary;
    if (!ps?.salary_amount) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
    const unitLabel = SALARY_UNIT_LABEL[ps.salary_unit ?? 'hour'] ?? '时';
    return `¥${Number(ps.salary_amount).toFixed(2)} / ${unitLabel}`;
  };

  const renderStatusCell = (v: string, r: WorkStudyApplication) => {
    const c = APP_STATUS_COLORS[v] ?? '#8c8c8c';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Tag
          className={styles.statusTag}
          style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}40` }}
        >
          {APP_STATUS_LABELS[v] ?? v}
        </Tag>
        {r.engagement_status === 'on_duty' && (
          <Tag color="cyan" style={{ margin: 0 }}>在职中</Tag>
        )}
        {r.engagement_status === 'offboarded' && (
          <Tag color="default" style={{ margin: 0 }}>
            已离岗{r.offboard_reason ? `·${OFFBOARD_REASON_LABELS[r.offboard_reason] ?? ''}` : ''}
          </Tag>
        )}
      </div>
    );
  };

  // 学生视角列：岗位 / 薪资 / 状态 / 上岗信息 / 提交时间 / 操作。
  // staff/employer 仍看「学生 / 岗位 / 资助档次 / 自述 / 状态 / 提交时间 / 操作」。
  const studentApplicationColumns: ColumnsType<WorkStudyApplication> = [
    { title: '岗位', key: 'position', width: 220, render: (_, r) => renderPositionCell(r) },
    { title: '薪资', key: 'salary', width: 130, render: (_, r) => renderSalaryCell(r) },
    { title: '状态', dataIndex: 'status', width: 130, render: renderStatusCell },
    {
      title: '进展',
      key: 'engagement_detail',
      width: 240,
      render: (_, r) => {
        // 在岗
        if (r.engagement_status === 'on_duty') {
          return (
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>上岗于 {r.engaged_at ? dayjs(r.engaged_at).format('YYYY-MM-DD') : '—'}</div>
              <button
                type="button"
                className={styles.actionLink}
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => openPositionFromApplication(r)}
              >
                查看工作地点 / 联系人
              </button>
            </div>
          );
        }
        // 已离岗
        if (r.engagement_status === 'offboarded') {
          return (
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--fg-3)' }}>
              <div>已离岗 {r.offboarded_at ? dayjs(r.offboarded_at).format('YYYY-MM-DD') : ''}</div>
              {r.offboard_reason && (
                <div style={{ color: 'var(--fg-4)' }}>
                  原因：{OFFBOARD_REASON_LABELS[r.offboard_reason] ?? r.offboard_reason}
                </div>
              )}
            </div>
          );
        }
        // 已驳回
        if (r.status === 'rejected') {
          return (
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <Tag color="error" style={{ margin: 0 }}>未通过</Tag>
              {r.decision_note && (
                <div style={{ color: 'var(--fg-4)', marginTop: 4 }}>
                  原因：{r.decision_note}
                </div>
              )}
            </div>
          );
        }
        // 审批中 / 已推荐
        if (r.status === 'pending' || r.status === 'recommended') {
          return (
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {r.status === 'recommended' ? '已推荐，待用人单位处理' : '等待用人单位审核'}
            </div>
          );
        }
        return <span style={{ color: 'var(--fg-4)' }}>—</span>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
  ];

  const staffApplicationColumns: ColumnsType<WorkStudyApplication> = [
    { title: '学生', dataIndex: 'student_name', width: 110 },
    {
      title: '岗位',
      key: 'position',
      width: 200,
      render: (_, r) => renderPositionCell(r),
    },
    {
      title: '资助档次',
      dataIndex: 'financial_aid_level',
      width: 110,
      render: (v: string | null) => AID_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '—',
    },
    { title: '自荐说明', dataIndex: 'intro', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 130, render: renderStatusCell },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
  ];

  const baseApplicationColumns = isStudent ? studentApplicationColumns : staffApplicationColumns;

  const applicationActionColumn: ColumnsType<WorkStudyApplication>[number] = {
    title: '操作',
    key: 'actions',
    width: 200,
    render: (_, r) => {
      const canDecide = canApproveApp && (r.status === 'pending' || r.status === 'recommended');
      const canInterview = canDecide;
      const canEmployerOffboard =
        (canManagePos || canApproveApp) && r.engagement_status === 'on_duty';
      const canStudentOffboard = isStudent && r.engagement_status === 'on_duty';
      const buttons: React.ReactNode[] = [];
      // 学生：任何状态下都给「查看岗位」入口，让他能回看自己投的岗位详情
      if (isStudent) {
        buttons.push(
          <button
            key="view-pos"
            className={styles.actionLink}
            onClick={() => openPositionFromApplication(r)}
          >
            查看岗位
          </button>,
        );
      }
      if (canInterview) {
        buttons.push(
          <button
            key="interview"
            className={styles.actionLink}
            onClick={() => openInterviewModal(r)}
          >
            面试通知
          </button>,
        );
      }
      if (canDecide) {
        buttons.push(
          <button
            key="decide"
            className={styles.actionLink}
            style={buttons.length ? { marginLeft: 12 } : undefined}
            onClick={() => {
              decideForm.setFieldsValue({ status: undefined, decision_note: '' });
              setDecideRecord(r);
            }}
          >
            处理
          </button>,
        );
      }
      if (canEmployerOffboard) {
        buttons.push(
          <button
            key="offboard-emp"
            className={styles.actionLink}
            style={buttons.length ? { marginLeft: 12 } : undefined}
            onClick={() => {
              offboardForm.setFieldsValue({ reason: 'terminated_by_employer', note: '' });
              setOffboardRecord({ app: r, mode: 'employer' });
            }}
          >
            离岗
          </button>,
        );
      }
      if (canStudentOffboard) {
        buttons.push(
          <button
            key="offboard-stu"
            className={styles.actionLink}
            style={buttons.length ? { marginLeft: 12 } : undefined}
            onClick={() => {
              offboardForm.setFieldsValue({ note: '' });
              setOffboardRecord({ app: r, mode: 'student' });
            }}
          >
            我要离岗
          </button>,
        );
      }
      return buttons.length ? <>{buttons}</> : <span style={{ color: 'var(--fg-4)' }}>—</span>;
    },
  };

  const applicationColumns: ColumnsType<WorkStudyApplication> = [
    ...baseApplicationColumns,
    applicationActionColumn,
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
        {tab === 'dashboard' && (
          <DashboardTab
            onJump={(target) => {
              setTab(target.tab);
              setPage(1);
              if (target.tab === 'applications') {
                setAppsStatusFilter(target.status);
                setAppsEngagementFilter(target.engagement);
                // 学生 Segmented 也跟着跳：审批中卡 → pending 段，已录用卡 → 在岗中段，未通过卡 → 历史
                if (isStudent) {
                  if (target.status === 'pending' || target.status === 'recommended') {
                    setStudentAppSegment('pending');
                  } else if (target.status === 'hired' || target.engagement === 'on_duty') {
                    setStudentAppSegment('on_duty');
                  } else if (target.status === 'rejected') {
                    setStudentAppSegment('history');
                  }
                }
              } else {
                setAppsStatusFilter(undefined);
                setAppsEngagementFilter(undefined);
              }
            }}
          />
        )}
        {tab === 'preference' && <PreferenceTab />}
        {tab === 'positions' && (
          <>
            {isStudent && (
              <RecommendationSection
                query={recommendationsQuery}
                onApply={async (rec) => {
                  try {
                    const pos = await getPosition(rec.position_id);
                    setApplyPosition(pos);
                  } catch (e) {
                    message.error(describeApiError(e, '加载岗位详情失败'));
                  }
                }}
              />
            )}
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
            {isStudent ? (
              <StudentPositionGrid
                positions={positionsQuery.data?.data ?? []}
                loading={positionsQuery.isFetching}
                total={Number(positionsQuery.data?.total ?? 0)}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                onView={setPositionDetail}
                onApply={setApplyPosition}
              />
            ) : (
              <Table<WorkStudyPosition>
                rowKey="id"
                columns={positionColumns}
                dataSource={positionsQuery.data?.data ?? []}
                loading={positionsQuery.isFetching}
                pagination={paginationProps(Number(positionsQuery.data?.total ?? 0))}
                size="middle"
              />
            )}
          </>
        )}
        {tab === 'applications' && (
          <>
            {/* 学生用 Segmented 分组；非学生保留旧的筛选 chip。 */}
            {isStudent && (() => {
              const all = applicationsQuery.data?.data ?? [];
              const onDuty = all.filter((a) => a.engagement_status === 'on_duty').length;
              const pending = all.filter((a) => a.status === 'pending' || a.status === 'recommended').length;
              const history = all.filter(
                (a) => a.status === 'rejected' || a.engagement_status === 'offboarded',
              ).length;
              return (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
                  <Segmented
                    value={studentAppSegment}
                    onChange={(v) => setStudentAppSegment(v as StudentAppSegment)}
                    options={[
                      { label: `在职中 ${onDuty}`, value: 'on_duty' },
                      { label: `审批中 ${pending}`, value: 'pending' },
                      { label: `历史 ${history}`, value: 'history' },
                    ]}
                  />
                </div>
              );
            })()}
            {!isStudent && (appsStatusFilter || appsEngagementFilter) && (
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  background: 'var(--bg-2)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                  当前筛选：
                </span>
                {appsStatusFilter && (
                  <Tag color="blue">状态={APP_STATUS_LABELS[appsStatusFilter] ?? appsStatusFilter}</Tag>
                )}
                {appsEngagementFilter === 'on_duty' && <Tag color="cyan">仅看在岗</Tag>}
                <Button
                  size="small"
                  type="text"
                  onClick={() => {
                    setAppsStatusFilter(undefined);
                    setAppsEngagementFilter(undefined);
                  }}
                >
                  清除
                </Button>
              </div>
            )}
            {(canApproveApp || canManagePos) && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                <Button
                  size="small"
                  loading={exportCurrentViewMutation.isPending}
                  onClick={() => exportCurrentViewMutation.mutate()}
                >
                  导出当前视图
                </Button>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={() => {
                    setAiReportNl('');
                    setAiReportDsl(null);
                    setAiReportOpen(true);
                  }}
                >
                  ✨ AI 报表
                </Button>
              </div>
            )}
            {(canApproveApp || canManagePos) && selectedAppKeys.length > 0 && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  background: 'var(--bg-2)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                  已选 <b>{selectedAppKeys.length}</b> 项
                  {onDutyCount > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--fg-4)' }}>
                      （其中在岗 {onDutyCount}）
                    </span>
                  )}
                </span>
                <Button
                  size="small"
                  danger
                  disabled={onDutyCount === 0}
                  onClick={() => {
                    batchOffboardForm.setFieldsValue({ reason: 'terminated_by_employer', note: '' });
                    setBatchOffboardOpen(true);
                  }}
                >
                  批量终止 ({onDutyCount})
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    batchNotifyForm.setFieldsValue({ title: '', body: '' });
                    setBatchNotifyOpen(true);
                  }}
                >
                  批量发通知 ({selectedAppKeys.length})
                </Button>
                <Button size="small" type="text" onClick={clearSelection}>
                  取消
                </Button>
              </div>
            )}
            <Table<WorkStudyApplication>
              rowKey="id"
              columns={applicationColumns}
              dataSource={(() => {
                const all = applicationsQuery.data?.data ?? [];
                if (isStudent) {
                  if (studentAppSegment === 'on_duty') {
                    return all.filter((a) => a.engagement_status === 'on_duty');
                  }
                  if (studentAppSegment === 'pending') {
                    return all.filter((a) => a.status === 'pending' || a.status === 'recommended');
                  }
                  return all.filter(
                    (a) => a.status === 'rejected' || a.engagement_status === 'offboarded',
                  );
                }
                if (appsEngagementFilter === 'on_duty') {
                  return all.filter((a) => a.engagement_status === 'on_duty');
                }
                return all;
              })()}
              loading={applicationsQuery.isFetching}
              pagination={
                isStudent
                  ? false  // 学生侧 size=200 一次拉完，分段过滤后不再翻页
                  : paginationProps(Number(applicationsQuery.data?.total ?? 0))
              }
              size="middle"
              rowSelection={
                canApproveApp || canManagePos
                  ? {
                      selectedRowKeys: selectedAppKeys,
                      onChange: (keys, rows) => {
                        setSelectedAppKeys(keys);
                        setSelectedAppRows(rows);
                      },
                    }
                  : undefined
              }
              expandable={
                isStudent
                  ? {
                      // 默认 ▶ 太小学生看不到。改成带底色的小药丸（图标 + 短文字），
                      // 状态色让眼睛能扫到：默认蓝、驳回行红。
                      expandIcon: ({ expanded, onExpand, record }) => {
                        const isRejected = record.status === 'rejected';
                        const bg = isRejected ? 'rgba(255,77,79,0.12)' : 'rgba(22,119,255,0.10)';
                        const fg = isRejected ? '#cf1322' : '#1677ff';
                        return (
                          <button
                            type="button"
                            onClick={(e) => onExpand(record, e)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: bg,
                              color: fg,
                              border: `1px solid ${fg}33`,
                              cursor: 'pointer',
                              fontSize: 12,
                              lineHeight: 1.4,
                              whiteSpace: 'nowrap',
                            }}
                            title={isRejected ? '查看驳回原因' : '查看审批进度'}
                          >
                            详情 {expanded ? '▴' : '▾'}
                          </button>
                        );
                      },
                      // 学生展开：审批进度（pending/已录用都看得到轨迹）+ 驳回原因
                      expandedRowRender: (r) => (
                        <div style={{ padding: '8px 16px' }}>
                          {r.workflow_instance_id ? (
                            <>
                              <div style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 8 }}>
                                审批轨迹：
                              </div>
                              <InstanceTimeline instanceId={r.workflow_instance_id} />
                            </>
                          ) : (
                            <span style={{ color: 'var(--fg-4)' }}>该申请无审批流（历史导入或直接录用）</span>
                          )}
                          {r.status === 'rejected' && r.decision_note && (
                            <div
                              style={{
                                marginTop: 12,
                                padding: 8,
                                background: 'rgba(255,77,79,0.08)',
                                borderRadius: 4,
                                fontSize: 13,
                              }}
                            >
                              驳回说明：{r.decision_note}
                            </div>
                          )}
                          {r.engagement_status === 'offboarded' && r.offboard_note && (
                            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--fg-3)' }}>
                              离岗备注：{r.offboard_note}
                            </div>
                          )}
                        </div>
                      ),
                    }
                  : undefined
              }
            />
          </>
        )}
        {tab === 'employers' && <div style={{ padding: 16 }}><EmployersTab /></div>}
        {tab === 'salaries' && <div style={{ padding: 16 }}><SalariesTab /></div>}
        {tab === 'business_config' && <div style={{ padding: 16 }}><BusinessConfigTab /></div>}
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

      {/* 候选对比 Drawer — 替代原 AskAIChip 文字摘要,结构化展示并支持快速 decide */}
      <ApplicantCompareDrawer
        position={comparePosition}
        onClose={() => setComparePosition(null)}
        canDecide={canApproveApp}
      />

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
          initialValues={{ position_type: 'fixed', salary_unit: 'hour', financial_aid_policy: 'none' }}
          onValuesChange={(changed) => {
            // 用户**手动**换用人单位时,清空岗位负责人 — 否则旧 employer 的负责人
            // 留在 form value 里,提交会被后端 OWNER_NOT_IN_EMPLOYER 拒绝。
            // 注意:onValuesChange 只在 UI 交互时触发,setFieldsValue (克隆模板预填) 不触发,
            // 所以克隆模板同时填的 employer + owner 不会被误清空。
            if (Object.prototype.hasOwnProperty.call(changed, 'employer_id')) {
              createForm.setFieldValue('owner_user_id', undefined);
            }
          }}
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
          <Form.Item label="岗位类型" name="position_type">
            <Radio.Group options={TYPE_OPTIONS} optionType="button" />
          </Form.Item>

          <Divider orientation="left" plain>负责人 & 地点</Divider>
          <Form.Item
            label="岗位负责人"
            name="owner_user_id"
            tooltip="学生提交申请后由该负责人审核；候选人从所选用人单位的负责人 / 操作员中选"
          >
            <OwnerUserSelect employerId={createEmployerId} />
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
          <Form.Item label="困难生倾斜策略" name="financial_aid_policy" tooltip="P0 简化：4 选 1 即可。only=非困难生不能申请；bonus/reserved=AI 推荐时加权；none=不倾斜">
            <Radio.Group
              options={[
                { label: '不倾斜', value: 'none' },
                { label: '困难加分', value: 'bonus' },
                { label: '困难保底名额', value: 'reserved' },
                { label: '仅限困难生', value: 'only' },
              ]}
              optionType="button"
            />
          </Form.Item>
          <Form.Item
            label="保底名额数"
            name="reserved_count"
            tooltip="仅 reserved 策略生效；headcount 中预留多少给困难生"
            dependencies={['financial_aid_policy']}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="保底策略下填，其他可留空" />
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
          <Form.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                自荐说明
                <Button
                  size="small"
                  type="link"
                  loading={aiApplyIntroMutation.isPending}
                  onClick={() => aiApplyIntroMutation.mutate()}
                  style={{ padding: '0 4px' }}
                >
                  ✨ AI 起草
                </Button>
              </span>
            }
            name="intro"
            rules={[{ required: true, message: '请填写自荐说明' }]}
          >
            <TextArea rows={5} maxLength={2000} showCount placeholder="简要说明为何适合此岗位，或点击 ✨AI 起草 一键生成" />
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

      {/* Offboard modal — A2 直接动作，无审批流 */}
      <Modal
        title={offboardRecord?.mode === 'student' ? '我要离岗' : '终止上岗'}
        open={offboardRecord !== null}
        onOk={handleOffboard}
        onCancel={() => {
          setOffboardRecord(null);
          offboardForm.resetFields();
        }}
        okText={offboardRecord?.mode === 'student' ? '确认离岗' : '确认终止'}
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={offboardMutation.isPending}
      >
        {offboardRecord && (
          <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
            {offboardRecord.mode === 'employer'
              ? `将让 ${offboardRecord.app.student_name} 从该岗位离岗，对方将收到通知。`
              : '提交即生效（无需用人单位审批）；之后将无法再上报本岗位的工时，用人单位会收到离岗通知。'}
          </div>
        )}
        <Form form={offboardForm} layout="vertical" style={{ marginTop: 8 }}>
          {offboardRecord?.mode === 'employer' && (
            <>
              <Form.Item label="原因" name="reason" rules={[{ required: true, message: '请选择原因' }]}>
                <Radio.Group
                  options={[
                    { label: '单位终止', value: 'terminated_by_employer' },
                    { label: '任期到期', value: 'completed' },
                  ]}
                  optionType="button"
                />
              </Form.Item>
              {/* 终止类别：仅在"单位终止"路径出现，驱动主动关怀 R011 精准触发。
                  把"裁岗 / 匹配不佳"从"被辞"里分出来，避免学生被误标。*/}
              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.reason !== cur.reason}
              >
                {({ getFieldValue }) =>
                  getFieldValue('reason') === 'terminated_by_employer' && (
                    <Form.Item
                      label="终止类别"
                      name="dismissalCategory"
                      rules={[{ required: true, message: '请选择终止类别' }]}
                      tooltip="不同类别会用于学校学工系统的关怀判断；学生本人看不到具体类别"
                    >
                      <Select
                        placeholder="选择最贴近的类别"
                        options={[
                          { label: '工作表现 / 能力不达标', value: 'performance' },
                          { label: '违反岗位纪律（旷工 / 顶替 / 冲突）', value: 'discipline' },
                          { label: '单位裁岗 / 项目结束（学生无责）', value: 'position_dissolved' },
                          { label: '双方匹配不佳（中性）', value: 'mismatch' },
                          { label: '其他（请在说明中详述）', value: 'other' },
                        ]}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </>
          )}
          <Form.Item label="说明" name="note">
            <TextArea
              rows={3}
              maxLength={2000}
              placeholder={offboardRecord?.mode === 'student' ? '说说为何离岗（选填）' : '记录离岗原因（选填）'}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Interview notice modal — B2，AI 一键起草 + 用户可编辑 */}
      <Modal
        title="发送面试通知"
        open={interviewRecord !== null}
        onOk={handleSendInterview}
        onCancel={() => {
          setInterviewRecord(null);
          interviewForm.resetFields();
        }}
        okText="发送通知"
        cancelText="取消"
        confirmLoading={interviewMutation.isPending}
        width={620}
      >
        {interviewRecord && (
          <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
            面试人：<b>{interviewRecord.app.student_name}</b> · 岗位：
            <b>{interviewRecord.position.title}</b>
            {interviewRecord.app.interview_notified_at && (
              <span style={{ marginLeft: 8, color: 'var(--ac)' }}>
                · 上次发送：{dayjs(interviewRecord.app.interview_notified_at).format('MM-DD HH:mm')}
              </span>
            )}
          </div>
        )}
        <Form form={interviewForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="面试时间"
            name="interview_at"
            rules={[{ required: true, message: '请选择面试时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item
            label="面试地点"
            name="interview_location"
            rules={[{ required: true, message: '请填写面试地点' }]}
          >
            <Input maxLength={200} placeholder="如 图书馆 305 室" />
          </Form.Item>
          <Form.Item label="内部备注（不发给学生）" name="interview_notes">
            <TextArea rows={2} maxLength={2000} placeholder="选填，如：请准备简历 / 带学生证" />
          </Form.Item>
          <Form.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                通知正文 → 学生
                <Button
                  size="small"
                  type="link"
                  loading={aiDraftMutation.isPending}
                  onClick={() => aiDraftMutation.mutate()}
                  style={{ padding: '0 4px' }}
                >
                  ✨ AI 起草
                </Button>
              </span>
            }
            name="body"
            rules={[{ required: true, message: '请填写通知正文，或点击 AI 起草' }]}
          >
            <TextArea
              rows={5}
              maxLength={4000}
              showCount
              placeholder="填写好时间、地点后，点击「AI 起草」一键生成；也可自行撰写"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* A3 批量终止 */}
      <Modal
        title={`批量终止上岗（影响 ${onDutyCount} 人）`}
        open={batchOffboardOpen}
        onOk={handleBatchOffboard}
        onCancel={() => {
          setBatchOffboardOpen(false);
          batchOffboardForm.resetFields();
        }}
        okText="确认终止"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={batchOffboardMutation.isPending}
      >
        <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
          仅在岗学生会被处理；选中的非在岗（已离岗 / 未录用）会自动跳过。
        </div>
        <Form form={batchOffboardForm} layout="vertical">
          <Form.Item label="原因" name="reason" rules={[{ required: true, message: '请选择原因' }]}>
            <Radio.Group
              options={[
                { label: '单位终止', value: 'terminated_by_employer' },
                { label: '任期到期', value: 'completed' },
              ]}
              optionType="button"
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.reason !== cur.reason}
          >
            {({ getFieldValue }) =>
              getFieldValue('reason') === 'terminated_by_employer' && (
                <Form.Item
                  label="终止类别（统一适用于本批）"
                  name="dismissalCategory"
                  rules={[{ required: true, message: '请选择终止类别' }]}
                  tooltip="批量适用，如不同学生原因不同请分批操作"
                >
                  <Select
                    placeholder="选择最贴近的类别"
                    options={[
                      { label: '工作表现 / 能力不达标', value: 'performance' },
                      { label: '违反岗位纪律', value: 'discipline' },
                      { label: '单位裁岗 / 项目结束', value: 'position_dissolved' },
                      { label: '双方匹配不佳', value: 'mismatch' },
                      { label: '其他', value: 'other' },
                    ]}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item label="说明" name="note">
            <TextArea rows={3} maxLength={2000} placeholder="选填，会一并写入每条记录的离岗备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* A4 AI 报表 */}
      <Modal
        title="✨ AI 报表"
        open={aiReportOpen}
        onCancel={() => {
          setAiReportOpen(false);
          setAiReportNl('');
          setAiReportDsl(null);
        }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <div style={{ color: 'var(--fg-3)', fontSize: 13, marginBottom: 8 }}>
          用一句话描述你要的报表，AI 会解析成可下载的 Excel。例如：<br />
          <span style={{ color: 'var(--fg-4)' }}>"导出本月已录用的学生及岗位、决定时间"</span>
        </div>
        <TextArea
          rows={3}
          value={aiReportNl}
          onChange={(e) => setAiReportNl(e.target.value)}
          maxLength={500}
          showCount
          placeholder="如：本学年所有在岗学生 / 上个月被拒的申请 / 计算机学院学生的勤工记录"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button
            type="primary"
            ghost
            loading={aiReportParseMutation.isPending}
            disabled={!aiReportNl.trim()}
            onClick={() => aiReportParseMutation.mutate()}
          >
            解析需求
          </Button>
        </div>
        {aiReportDsl && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'var(--bg-2)',
              border: '1px solid var(--bd)',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{aiReportDsl.title || '未命名报表'}</div>
            {aiReportDsl.summary && (
              <div style={{ color: 'var(--fg-3)', marginBottom: 10, fontStyle: 'italic' }}>
                {aiReportDsl.summary}
              </div>
            )}
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--fg-4)' }}>筛选：</span>
              {Object.keys(aiReportDsl.filters).length === 0 ? (
                <span style={{ color: 'var(--fg-4)' }}>无（导出全部）</span>
              ) : (
                Object.entries(aiReportDsl.filters).map(([k, v]) => (
                  <Tag key={k} style={{ marginRight: 6 }}>
                    {k}={String(v)}
                  </Tag>
                ))
              )}
            </div>
            <div>
              <span style={{ color: 'var(--fg-4)' }}>列：</span>
              {aiReportDsl.columns.length === 0 ? (
                <span style={{ color: 'var(--fg-4)' }}>默认全部</span>
              ) : (
                aiReportDsl.columns.map((c) => (
                  <Tag key={c} color="blue" style={{ marginRight: 6 }}>
                    {WORKSTUDY_REPORT_COLUMNS.find((x) => x.key === c)?.label ?? c}
                  </Tag>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button
                type="primary"
                loading={aiReportExportMutation.isPending}
                onClick={() =>
                  aiReportExportMutation.mutate({
                    title: aiReportDsl.title,
                    summary: aiReportDsl.summary,
                    entity: 'application',
                    filters: aiReportDsl.filters,
                    columns: aiReportDsl.columns,
                  })
                }
              >
                下载 Excel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* A3 批量发通知 */}
      <Modal
        title={`批量发通知（影响 ${selectedAppKeys.length} 人）`}
        open={batchNotifyOpen}
        onOk={handleBatchNotify}
        onCancel={() => {
          setBatchNotifyOpen(false);
          batchNotifyForm.resetFields();
        }}
        okText="发送"
        cancelText="取消"
        confirmLoading={batchNotifyMutation.isPending}
        width={560}
      >
        <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
          所有选中申请的学生将收到同一条站内信。非自己负责的岗位会自动跳过。
        </div>
        <Form form={batchNotifyForm} layout="vertical">
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请填写通知标题' }]}
          >
            <Input maxLength={200} placeholder="如：本周勤工例会通知" />
          </Form.Item>
          <Form.Item
            label="正文"
            name="body"
            rules={[{ required: true, message: '请填写通知正文' }]}
          >
            <TextArea rows={5} maxLength={4000} showCount placeholder="发给学生看的具体内容" />
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
            {p.financial_aid_policy && p.financial_aid_policy !== 'none' ? (
              <Tag color={AID_POLICY_COLORS[p.financial_aid_policy] ?? 'default'}>
                {AID_POLICY_LABELS[p.financial_aid_policy]}
                {p.financial_aid_policy === 'reserved' && p.reserved_count ? `·${p.reserved_count}人` : ''}
              </Tag>
            ) : p.prefer_financial_aid ? (
              <Tag color="blue">优先困难生（旧）</Tag>
            ) : null}
            {p.self_arranged && <Tag color="orange">单位内部安排</Tag>}
            {!p.gender_limit && aidLevels.length === 0 && gradeLimits.length === 0
              && collegeLimits.length === 0 && !p.prefer_financial_aid && !p.self_arranged
              && (!p.financial_aid_policy || p.financial_aid_policy === 'none') && (
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

/** B3 — 学生侧"为你推荐"卡片区。AI 写不出理由时降级为评分维度 tags。 */
function RecommendationSection({
  query,
  onApply,
}: {
  query: ReturnType<typeof useQuery<PositionRecommendation[]>>;
  onApply: (rec: PositionRecommendation) => void;
}) {
  if (query.isLoading) {
    return (
      <div className={styles.recommendSection}>
        <div className={styles.recommendHeader}>✨ 正在为你匹配……</div>
      </div>
    );
  }
  const data = query.data ?? [];
  if (data.length === 0) return null;
  return (
    <div className={styles.recommendSection}>
      <div className={styles.recommendHeader}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>✨ 为你推荐</span>
        <span>· 综合你的资料、偏好和课表，从在招岗位里挑了 {data.length} 个</span>
      </div>
      <div className={styles.recommendCards}>
        {data.map((rec) => {
          const salary = rec.salary_amount
            ? `¥${Number(rec.salary_amount).toFixed(0)} / ${SALARY_UNIT_LABEL[rec.salary_unit ?? 'hour'] ?? '时'}`
            : null;
          return (
            <div key={rec.position_id} className={styles.recommendCard}>
              <div className={styles.recommendCardTitle}>{rec.title}</div>
              {/* 学生只关心：在哪、给多少。aid_policy / scoring_signals 这些技术字段不展示。 */}
              <div className={styles.recommendCardMeta}>
                {rec.campus && <span>{rec.campus}</span>}
                {salary && <span>{salary}</span>}
              </div>
              {/* 推荐理由：有 AI 文案才显示这一块；没有就空，不退化成英文 signals tag。 */}
              {rec.reason && (
                <div className={styles.recommendCardReason}>{rec.reason}</div>
              )}
              <div className={styles.recommendCardFooter}>
                <span className={styles.recommendScore}>匹配度 {Math.round(rec.score)}</span>
                <Button size="small" type="primary" onClick={() => onApply(rec)}>
                  申请
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// P3.B 学生「找岗位」卡片视图。staff 仍走原 Table。
function StudentPositionGrid({
  positions,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onView,
  onApply,
}: {
  positions: WorkStudyPosition[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onView: (p: WorkStudyPosition) => void;
  onApply: (p: WorkStudyPosition) => void;
}) {
  if (loading && positions.length === 0) {
    return <div className={styles.posCardEmpty}>加载中…</div>;
  }
  if (!loading && positions.length === 0) {
    return (
      <div className={styles.posCardEmpty}>
        当前没有可申请的岗位。可以先去「偏好设置」更新课表和岗位偏好，让 AI 更准地推荐。
      </div>
    );
  }
  return (
    <>
      <div className={styles.posGrid}>
        {positions.map((p) => {
          const salaryNum = p.salary_amount != null ? Number(p.salary_amount) : null;
          const salaryUnit = SALARY_UNIT_LABEL[p.salary_unit ?? 'hour'] ?? '时';
          const policy =
            p.financial_aid_policy && p.financial_aid_policy !== 'none'
              ? p.financial_aid_policy
              : p.prefer_financial_aid
              ? 'bonus'
              : null;
          const paused = p.status === 'open' && p.accepting_applications === false;
          const isFull = !!p.headcount && (p.hired_count ?? 0) >= p.headcount;
          return (
            <div
              key={p.id}
              className={`${styles.posCard} ${paused ? styles.posCardPaused : ''}`}
            >
              <div className={styles.posCardHeader}>
                <div className={styles.posCardTitle}>{p.title}</div>
                <span
                  className={`${styles.posCardTypeBadge} ${
                    p.position_type === 'temporary' ? styles.posCardTypeBadgeTemp : ''
                  }`}
                >
                  {p.position_type === 'fixed' ? '固定岗' : '临时岗'}
                </span>
              </div>
              <div className={styles.posCardSubtitle}>
                {p.department_name || '未填用人单位'}
                {p.campus ? ` · ${p.campus}` : ''}
              </div>

              {(policy || paused) && (
                <div className={styles.posCardTags}>
                  {policy && (
                    <Tag color={AID_POLICY_COLORS[policy] ?? 'default'} style={{ margin: 0 }}>
                      {AID_POLICY_LABELS[policy] ?? policy}
                      {policy === 'reserved' && p.reserved_count ? `·${p.reserved_count}人` : ''}
                    </Tag>
                  )}
                  {paused && (
                    <Tag color="orange" style={{ margin: 0 }}>
                      暂停招新
                    </Tag>
                  )}
                </div>
              )}

              {salaryNum != null ? (
                <div className={styles.posCardSalary}>
                  ¥{salaryNum.toFixed(salaryNum % 1 === 0 ? 0 : 2)}
                  <span className={styles.posCardSalaryUnit}>/{salaryUnit}</span>
                </div>
              ) : (
                <div className={styles.posCardSalary} style={{ color: 'var(--fg-4)' }}>—</div>
              )}

              <div className={styles.posCardMeta}>
                {p.work_location && (
                  <span className={styles.posCardMetaItem}>
                    <span className={styles.posCardMetaLabel}>📍</span>
                    {p.work_location}
                  </span>
                )}
                {p.weekly_hours && (
                  <span className={styles.posCardMetaItem}>
                    <span className={styles.posCardMetaLabel}>⏱</span>
                    {p.weekly_hours}h / 周
                  </span>
                )}
                {p.headcount ? (
                  <span className={styles.posCardMetaItem}>
                    <span className={styles.posCardMetaLabel}>👥</span>
                    <span className={`${styles.posCardHeadcount} ${isFull ? styles.posCardHeadcountFull : ''}`}>
                      {p.hired_count ?? 0} / {p.headcount}
                    </span>
                  </span>
                ) : null}
              </div>

              <div className={styles.posCardFooter}>
                <Button size="small" type="text" onClick={() => onView(p)}>
                  详情
                </Button>
                {p.status === 'open' && !paused && !isFull ? (
                  <Button size="small" type="primary" onClick={() => onApply(p)}>
                    申请
                  </Button>
                ) : (
                  <Button size="small" disabled>
                    {paused ? '暂停招新' : isFull ? '已招满' : '不可申请'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {total > pageSize && (
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
            showSizeChanger={false}
            size="small"
            showTotal={(t) => `共 ${t} 个岗位`}
          />
        </div>
      )}
    </>
  );
}

