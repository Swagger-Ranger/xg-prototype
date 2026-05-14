import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Tag, Select, Button, DatePicker, Segmented, Modal, Input } from 'antd';
import { message } from '@/utils/antdApp';
import { RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveRequest, LeaveTypeConfig, PendingTaskEnriched } from '@xg1/shared';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from '@xg1/shared';
import type { LeaveQueryParams } from '@/api/leave';
import {
  getMyLeaves,
  withdrawLeave,
  cancelLeave,
  getClassLeaves,
  getUncancelledLeaves,
  getPendingManualReturns,
  reviewManualReturn,
  getLeaveTypes,
  confirmCancelLeave,
  forceCancelLeave,
} from '@/api/leave';
import { approveTask, rejectTask, getPendingEnriched, logAiRecommendation } from '@/api/workflow';
import { polishRejection } from '@/api/ai';
import { describeApiError } from '@/utils/api-error';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import AskAIChip from '@/components/ai/AskAIChip';
import LeaveApplyModal from './LeaveApplyModal';
import LeaveDetailDrawer from './LeaveDetailDrawer';
import styles from './index.module.css';

const { RangePicker } = DatePicker;

type TabKey = 'all' | 'uncancelled' | 'pending_manual_return';

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '审批中', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已撤销', value: 'cancelled' },
  { label: '销假审批中', value: 'cancel_pending' },
  { label: '人工销假待审', value: 'pending_manual_return' },
];

/** embedded=true 时由 LeaveAppPage 包裹的「请假列表」tab — 隐藏 h1,
 *  避免和外层 Tab "请假列表" 重复标题。 */
export default function LeaveManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const { isStudent, user, hasPermission } = useAuth();
  // 能力门：用权限码而非角色 boolean，配置层只需调 sys_role_permission
  // 即可改变行为，无需重新发版。视角类判断（标题、column 集）继续看 isStudent。
  const canSubmitOwn = hasPermission('leave:submit');
  const canApprove = hasPermission('leave:approve');
  const canManage = hasPermission('leave:manage');
  const canReturnManual = hasPermission('leave:return:manual');
  const [searchParams] = useSearchParams();
  const initialStatus = STATUS_OPTIONS.some((o) => o.value === searchParams.get('status'))
    ? searchParams.get('status') ?? ''
    : '';
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState(initialStatus);
  const [filterType, setFilterType] = useState('');
  const [filterDates, setFilterDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPrefill, setApplyPrefill] = useState<Record<string, unknown> | undefined>();
  const [detailRecord, setDetailRecord] = useState<LeaveRequest | null>(null);

  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);
  const setContext = useAIActionStore((s) => s.setContext);
  const hoveredRef = useAIActionStore((s) => s.hoveredRef);

  // Report page context to AI
  useEffect(() => {
    setContext({ page: 'leave', modal: applyOpen ? 'leave_apply' : undefined });
  }, [applyOpen, setContext]);

  useEffect(() => {
    if (!aiAction) return;
    if (aiAction.type === 'open_leave_form') {
      setApplyPrefill(aiAction.data ?? undefined);
      setApplyOpen(true);
      consumeAction();
    }
  }, [aiAction, consumeAction]);

  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;

  const queryParams: LeaveQueryParams = {
    page,
    size: PAGE_SIZE,
    status: filterStatus || undefined,
    leave_type_code: filterType || undefined,
    start_date: filterDates?.[0]?.format('YYYY-MM-DD'),
    end_date: filterDates?.[1]?.format('YYYY-MM-DD'),
  };

  const { data: myLeavesData, isFetching: myLeavesFetching } = useQuery({
    queryKey: ['myLeaves', queryParams],
    queryFn: () => getMyLeaves(queryParams),
    enabled: canSubmitOwn,
  });

  const { data: allData, isFetching: allFetching } = useQuery({
    queryKey: ['classLeaves', queryParams],
    queryFn: () => getClassLeaves(queryParams),
    enabled: canApprove && tab === 'all',
  });

  const { data: uncancelledData, isFetching: uncancelledFetching } = useQuery({
    queryKey: ['uncancelledLeaves', queryParams],
    queryFn: () => getUncancelledLeaves(queryParams),
    enabled: canApprove && tab === 'uncancelled',
  });

  const { data: pendingManualData, isFetching: pendingManualFetching } = useQuery({
    queryKey: ['pendingManualReturns', queryParams],
    queryFn: () => getPendingManualReturns(queryParams),
    enabled: canReturnManual && tab === 'pending_manual_return',
  });

  const reviewManualMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      reviewManualReturn(id, approve),
    onSuccess: (_, { approve }) => {
      message.success(approve ? '已同意人工销假' : '已退回学生');
      queryClient.invalidateQueries({ queryKey: ['pendingManualReturns'] });
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '审核失败,请重试')),
  });

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
  });

  const confirmMutation = useMutation({
    mutationFn: confirmCancelLeave,
    onSuccess: () => {
      message.success('销假确认成功');
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '确认销假失败，请重试')),
  });

  const forceMutation = useMutation({
    mutationFn: forceCancelLeave,
    onSuccess: () => {
      message.success('强制销假成功');
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '强制销假失败，请重试')),
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawLeave,
    onSuccess: () => {
      message.success('撤回成功');
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '撤回失败，请重试')),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelLeave,
    onSuccess: () => {
      message.success('销假申请已提交');
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '销假申请失败，请重试')),
  });

  // Pending workflow tasks where the current user is the assignee. Only used
  // to surface 批准/驳回 buttons on the rows we actually own — i.e. 辅导员
  // sees them only on his/her counselor_approval steps; 院长 only on the
  // college_approval steps. Skipped for students.
  const { data: pendingTaskData } = useQuery({
    queryKey: ['leavePendingTasks', user?.id],
    queryFn: () => getPendingEnriched({ page: 1, size: 200, assigneeId: String(user!.id) }),
    enabled: canApprove && !!user?.id,
    staleTime: 30 * 1000,
  });
  const myLeaveTaskByBizId = useMemo(() => {
    const m = new Map<string, PendingTaskEnriched>();
    for (const t of pendingTaskData?.data ?? []) {
      if (t.biz_type === 'leave' && t.biz_id) m.set(String(t.biz_id), t);
    }
    return m;
  }, [pendingTaskData]);

  const [approveTarget, setApproveTarget] = useState<{ task: PendingTaskEnriched; record: LeaveRequest } | null>(null);
  const [approveComment, setApproveComment] = useState('同意');
  const [rejectTarget, setRejectTarget] = useState<{ task: PendingTaskEnriched; record: LeaveRequest } | null>(null);
  // Single textarea — what the student sees. AI 改写 produces a connected
  // paragraph that already contains both "why rejected" and "how to fix"
  // (the prompt instructs the LLM to combine the two layers), so the UI
  // doesn't need to split them.
  const [rejectComment, setRejectComment] = useState('');
  // Pre-polish draft, so the user can one-click revert. null = either never
  // polished, or manually edited after polish (commits the new wording).
  const [polishOriginal, setPolishOriginal] = useState<string | null>(null);
  const [polishLoading, setPolishLoading] = useState(false);

  const invalidateAfterDecision = () => {
    queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['leavePendingTasks'] });
    queryClient.invalidateQueries({ queryKey: ['pendingEnriched'] });
  };

  const approveTaskMutation = useMutation({
    mutationFn: ({ taskId, comment }: { taskId: string; comment: string }) =>
      approveTask(taskId, comment),
    onSuccess: (_, vars) => {
      message.success('已批准');
      // List-page approvals don't surface the AI rec inline (no expanded
      // panel), so we log without an AI snapshot — the agreement_state
      // column will be 'no_ai' for these rows.
      if (approveTarget) {
        logAiRecommendation({
          task_id: vars.taskId,
          biz_type: approveTarget.task.biz_type ?? undefined,
          biz_id: approveTarget.task.biz_id ?? undefined,
          human_decision: 'approve',
          human_comment: vars.comment,
        });
      }
      setApproveTarget(null);
      invalidateAfterDecision();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '批准失败，请重试')),
  });

  const rejectTaskMutation = useMutation({
    mutationFn: ({ taskId, comment }: { taskId: string; comment: string }) =>
      rejectTask(taskId, comment),
    onSuccess: (_, vars) => {
      message.success('已驳回');
      if (rejectTarget) {
        logAiRecommendation({
          task_id: vars.taskId,
          biz_type: rejectTarget.task.biz_type ?? undefined,
          biz_id: rejectTarget.task.biz_id ?? undefined,
          human_decision: 'reject',
          human_comment: vars.comment,
        });
      }
      setRejectTarget(null);
      invalidateAfterDecision();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '驳回失败，请重试')),
  });

  const openApprove = (record: LeaveRequest) => {
    const task = myLeaveTaskByBizId.get(String(record.id));
    if (!task) return;
    setApproveTarget({ task, record });
    setApproveComment('同意');
  };
  const openReject = (record: LeaveRequest) => {
    const task = myLeaveTaskByBizId.get(String(record.id));
    if (!task) return;
    setRejectTarget({ task, record });
    setRejectComment('');
    setPolishOriginal(null);
  };

  const handlePolish = async () => {
    const draft = rejectComment.trim();
    if (!draft) {
      message.warning('请先写一句草稿，AI 才能改写');
      return;
    }
    setPolishLoading(true);
    try {
      // Pack just enough context for the LLM to write a targeted rejection:
      // who's asking, what type, how long, and the student's own reason.
      // Skipping form_data / 附件 / 紧急联系人 — the LLM doesn't need them
      // for a 1-3 sentence rewrite, and ballooning the prompt isn't worth it.
      const r = rejectTarget?.record;
      const ctx = rejectTarget
        ? [
            `审批节点：${rejectTarget.task.node_name ?? ''}`,
            `学生：${r?.student_name ?? ''}`,
            `请假类型：${r?.leave_type_name ?? '请假'}`,
            `时长：${r?.duration_days ?? '?'}天`,
            r?.reason ? `学生写的请假理由：${r.reason}` : '',
          ].filter(Boolean).join('\n')
        : undefined;
      const res = await polishRejection(draft, ctx);
      if (res.error_message) {
        message.warning('AI 改写不可用，已保留原稿');
        return;
      }
      if (!res.polished || res.polished.trim() === draft) {
        message.info('AI 没有给出更好的改写');
        return;
      }
      setPolishOriginal(draft);
      setRejectComment(res.polished.trim());
      message.success('已用 AI 改写，可点「撤销」恢复原稿');
    } catch (e) {
      message.error(describeApiError(e, 'AI 改写失败'));
    } finally {
      setPolishLoading(false);
    }
  };

  const handleRevertPolish = () => {
    if (polishOriginal == null) return;
    setRejectComment(polishOriginal);
    setPolishOriginal(null);
  };

  const handleTabChange = (val: string | number) => {
    setTab(val as TabKey);
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
  };

  // canSubmitOwn 优先：拥有"提交自己请假"能力时默认呈现自己的列表（学生 + 任何被
  // 授权 leave:submit 的老师）。同时拥有 canApprove 时由 tab 切到全班/未销假/人工销假视图。
  const currentData = canSubmitOwn && !canApprove
    ? myLeavesData
    : tab === 'uncancelled'
      ? uncancelledData
      : tab === 'pending_manual_return'
        ? pendingManualData
        : allData;
  const isLoading = canSubmitOwn && !canApprove
    ? myLeavesFetching
    : tab === 'uncancelled'
      ? uncancelledFetching
      : tab === 'pending_manual_return'
        ? pendingManualFetching
        : allFetching;

  const studentColumns: ColumnsType<LeaveRequest> = [
    {
      title: '假别',
      dataIndex: 'leave_type_name',
      width: 100,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 130,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 130,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '天数',
      dataIndex: 'duration_days',
      width: 70,
      render: (v: number) => `${v}天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const color = LEAVE_STATUS_COLORS[status as keyof typeof LEAVE_STATUS_COLORS];
        const label = LEAVE_STATUS_LABELS[status as keyof typeof LEAVE_STATUS_LABELS];
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
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <span>
          <button
            className={styles.actionLink}
            onClick={() => setDetailRecord(record)}
          >
            查看
          </button>
          {record.status === 'pending' && (
            <button
              className={`${styles.actionLink} ${styles.warn}`}
              onClick={() => Modal.confirm({
                title: '确认撤回',
                content: '确定要撤回该请假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => withdrawMutation.mutate(record.id),
              })}
            >
              撤回
            </button>
          )}
          {record.status === 'approved' && (
            <button
              className={`${styles.actionLink} ${styles.danger}`}
              onClick={() => Modal.confirm({
                title: '确认销假',
                content: '确定要提交销假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => cancelMutation.mutate(record.id),
              })}
            >
              销假
            </button>
          )}
        </span>
      ),
    },
  ];

  const columns: ColumnsType<LeaveRequest> = [
    {
      title: '学生姓名',
      dataIndex: 'student_name',
      width: 100,
    },
    {
      title: '假别',
      dataIndex: 'leave_type_name',
      width: 100,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 130,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 130,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '天数',
      dataIndex: 'duration_days',
      width: 70,
      render: (v: number) => `${v}天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const color = LEAVE_STATUS_COLORS[status as keyof typeof LEAVE_STATUS_COLORS];
        const label = LEAVE_STATUS_LABELS[status as keyof typeof LEAVE_STATUS_LABELS];
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
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_, record) => {
        const myTask = myLeaveTaskByBizId.get(String(record.id));
        return (
        <span>
          <button
            className={styles.actionLink}
            onClick={() => setDetailRecord(record)}
          >
            查看
          </button>
          {record.status === 'pending' && myTask && (
            <>
              <button
                className={`${styles.actionLink} ${styles.warn}`}
                onClick={() => openApprove(record)}
              >
                批准
              </button>
              <button
                className={`${styles.actionLink} ${styles.danger}`}
                onClick={() => openReject(record)}
              >
                驳回
              </button>
            </>
          )}
          {record.status === 'cancel_pending' && (
            <button
              className={`${styles.actionLink} ${styles.warn}`}
              onClick={() => Modal.confirm({
                title: '确认销假',
                content: '确定要确认该学生的销假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => confirmMutation.mutate(record.id),
              })}
            >
              确认销假
            </button>
          )}
          {record.status === 'pending_manual_return' && (
            <>
              <button
                className={`${styles.actionLink} ${styles.warn}`}
                onClick={() => Modal.confirm({
                  title: '同意人工销假',
                  content: (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      <div>学生理由:{record.manual_return_reason ?? '(空)'}</div>
                      {record.manual_return_attachments && record.manual_return_attachments.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          附件:
                          {record.manual_return_attachments.map((f, i) => (
                            <div key={i}>
                              <a href={f.file_url} target="_blank" rel="noreferrer">{f.file_name}</a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                  okText: '同意销假',
                  cancelText: '取消',
                  onOk: () => reviewManualMutation.mutateAsync({ id: record.id, approve: true }),
                })}
              >
                同意销假
              </button>
              <button
                className={`${styles.actionLink} ${styles.danger}`}
                onClick={() => Modal.confirm({
                  title: '退回学生',
                  content: '退回后假期保持已通过状态,学生可重新申请人工销假或继续 GPS 销假。',
                  okText: '退回',
                  cancelText: '取消',
                  onOk: () => reviewManualMutation.mutateAsync({ id: record.id, approve: false }),
                })}
              >
                退回
              </button>
            </>
          )}
          {canManage && record.status === 'approved' && (
            <button
              className={`${styles.actionLink} ${styles.danger}`}
              onClick={() => Modal.confirm({
                title: '确认强制销假',
                content: '确定要强制销假吗？此操作不可撤销。',
                okText: '确定',
                cancelText: '取消',
                onOk: () => forceMutation.mutate(record.id),
              })}
            >
              强制销假
            </button>
          )}
          <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}>
            <AskAIChip
              refData={{
                type: 'leave',
                id: String(record.id),
                label: `${record.student_name ?? ''} 的${record.leave_type_name ?? '请假'}`,
                detail: `${record.leave_type_name ?? ''} · ${dayjs(record.start_time).format('MM-DD')}~${dayjs(record.end_time).format('MM-DD')} · ${record.duration_days}天 · ${LEAVE_STATUS_LABELS[record.status as keyof typeof LEAVE_STATUS_LABELS] ?? record.status}`,
              }}
              prompt="请分析这条请假申请（{label}，{detail}）：是否合规、有无风险点、建议是否批准？"
            />
          </span>
        </span>
        );
      },
    },
  ];

  return (
    <div className={styles.page}>
      {(!embedded || canSubmitOwn) && (
        <div className={styles.header}>
          {!embedded && (
            <h1 className={styles.title}>{isStudent ? '我的请假' : '请销假管理'}</h1>
          )}
          {canSubmitOwn && (
            <Button type="primary" onClick={() => setApplyOpen(true)}>
              申请请假
            </Button>
          )}
        </div>
      )}

      {canApprove && (
        <Segmented
          className={styles.segmented}
          options={[
            { label: '全部请假', value: 'all' },
            { label: '未销假', value: 'uncancelled' },
            ...(canReturnManual
              ? [{ label: '人工销假申请', value: 'pending_manual_return' as const }]
              : []),
          ]}
          value={tab}
          onChange={handleTabChange}
        />
      )}

      <div className={styles.filterBar}>
        <Select
          style={{ width: 130 }}
          value={filterStatus}
          onChange={setFilterStatus}
          options={STATUS_OPTIONS}
        />
        <Select
          style={{ width: 130 }}
          placeholder="全部假别"
          allowClear
          value={filterType || undefined}
          onChange={(v) => setFilterType(v ?? '')}
          options={leaveTypes.map((t) => ({ label: t.name, value: t.code }))}
        />
        <RangePicker
          format="YYYY-MM-DD"
          value={filterDates}
          onChange={(v) => setFilterDates(v as [Dayjs | null, Dayjs | null] | null)}
        />
        <Button type="primary" onClick={handleSearch}>
          查询
        </Button>
        <Button
          onClick={() => {
            setFilterStatus('');
            setFilterType('');
            setFilterDates(null);
            setPage(1);
          }}
        >
          重置
        </Button>
      </div>

      <div className={styles.tableCard}>
        <Table<LeaveRequest>
          rowKey="id"
          columns={isStudent ? studentColumns : columns}
          dataSource={currentData?.data ?? []}
          loading={isLoading}
          rowClassName={(record) =>
            hoveredRef?.type === 'leave' && hoveredRef.id === String(record.id)
              ? styles.hoveredRow
              : ''
          }
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

      <LeaveApplyModal open={applyOpen} onClose={() => { setApplyOpen(false); setApplyPrefill(undefined); }} prefill={applyPrefill} />
      <LeaveDetailDrawer
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        pendingTask={
          detailRecord ? myLeaveTaskByBizId.get(String(detailRecord.id)) ?? null : null
        }
        onApprove={() => detailRecord && openApprove(detailRecord)}
        onReject={() => detailRecord && openReject(detailRecord)}
      />

      <Modal
        open={!!approveTarget}
        title={approveTarget ? `批准 ${approveTarget.record.student_name ?? ''} 的请假` : ''}
        okText="确认批准"
        okButtonProps={{ loading: approveTaskMutation.isPending }}
        onOk={() => {
          if (!approveTarget) return;
          approveTaskMutation.mutate({
            taskId: approveTarget.task.id,
            comment: approveComment.trim() || '同意',
          });
        }}
        onCancel={() => setApproveTarget(null)}
        width="min(520px, 100vw)"
        destroyOnHidden
      >
        <div style={{ marginBottom: 8, color: 'var(--fg-3)', fontSize: 12 }}>
          节点：{approveTarget?.task.node_name ?? ''} · 时长 {approveTarget?.record.duration_days ?? '-'} 天
        </div>
        <Input.TextArea
          rows={3}
          value={approveComment}
          onChange={(e) => setApproveComment(e.target.value)}
          placeholder="留空将默认填写「同意」，学生可见"
        />
      </Modal>

      <Modal
        open={!!rejectTarget}
        title={rejectTarget ? `驳回 ${rejectTarget.record.student_name ?? ''} 的请假` : ''}
        okText="确认驳回"
        okButtonProps={{ danger: true, loading: rejectTaskMutation.isPending }}
        onOk={() => {
          if (!rejectTarget) return;
          const trimmed = rejectComment.trim();
          if (!trimmed) {
            message.warning('请填写驳回意见');
            return;
          }
          rejectTaskMutation.mutate({ taskId: rejectTarget.task.id, comment: trimmed });
        }}
        onCancel={() => setRejectTarget(null)}
        width="min(560px, 100vw)"
        destroyOnHidden
      >
        <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 12 }}>
          节点：{rejectTarget?.task.node_name ?? ''} · 时长 {rejectTarget?.record.duration_days ?? '-'} 天
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            驳回意见 <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
            <span style={{ color: 'var(--fg-4)', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              学生可见
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {polishOriginal != null && (
              <Button size="small" onClick={handleRevertPolish}>撤销 AI 改写</Button>
            )}
            <Button
              size="small"
              type="primary"
              ghost
              icon={<RobotOutlined />}
              loading={polishLoading}
              onClick={handlePolish}
            >
              AI 改写
            </Button>
          </div>
        </div>
        <Input.TextArea
          rows={4}
          value={rejectComment}
          onChange={(e) => {
            setRejectComment(e.target.value);
            // Manual edit commits the new text — drop the revert path.
            if (polishOriginal != null) setPolishOriginal(null);
          }}
          placeholder='先写一句草稿（如"时间不对"），点「AI 改写」会改成包含原因和建议的完整版本，可继续编辑'
          maxLength={1000}
          showCount
        />
      </Modal>
    </div>
  );
}
