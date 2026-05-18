import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spin, Tag, Button, Tooltip } from 'antd';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  ReloadOutlined, BulbOutlined, LikeOutlined, DislikeOutlined,
  DatabaseOutlined, ThunderboltOutlined,
  PushpinOutlined, PushpinFilled,
  CheckCircleOutlined, StopOutlined, MessageOutlined, FlagOutlined, WarningFilled,
  NotificationOutlined, FormOutlined, SendOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { PendingTaskEnriched } from '@xg1/shared';
import {
  type InsightItem,
  type InsightRef,
  type InsightSeverity,
  type WorkspaceInsight,
  getLatestInsight,
  parseInsights,
  refreshInsight,
  submitInsightFeedback,
} from '@/api/insight';
import { getPendingEnriched } from '@/api/workflow';
import { getClassRoster } from '@/api/counselor';
import { acceptCareTask, rejectCareTask, type CareSeverity, type CareStatus } from '@/api/care';
import { listCrisisSignals, type CrisisSignalListItem } from '@/api/crisis';
import { remindForm } from '@/api/collection';
import { useAIActionStore, type PinnedRef } from '@/stores/ai-action.store';
import { useBatchAction } from '@/hooks/useBatchAction';
import { useAuth } from '@/hooks/useAuth';
import PendingApprovalRow from '@/components/approval/PendingApprovalRow';
import {
  ApprovalRejectModal,
  useApprovalActions,
} from '@/components/approval/useApprovalActions';
import { filterLowRiskBatch } from '@/components/approval/lowRiskFilter';
import styles from './InsightCard.module.css';

function normalizeRef(raw: unknown): InsightRef | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { type: 'metric', id: raw, label: raw };
  }
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Partial<InsightRef>;
    const type = (r.type ?? 'metric') as InsightRef['type'];
    const id = String(r.id ?? '');
    const label = String(r.label ?? id);
    if (!label) return null;
    return { type, id, label };
  }
  return null;
}

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  info: '提示',
  warn: '关注',
  critical: '紧急',
};

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

/** 学生级 alert 严重度 → 中文。alert 表的 4 级 enum 与 insight 的 3 级
 *  不同（low/medium/high/critical vs info/warn/critical），所以单独一份。 */
const SEVERITY_ZH: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

interface InsightCardProps {
  role: 'counselor' | 'dean';
  title?: string;
  /** When set, insights are scoped to this class only — used by the per-class drawer. */
  classId?: number | string | null;
}

export default function InsightCard({ role, title = 'AI 观察员', classId = null }: InsightCardProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pinRef = useAIActionStore((s) => s.pinRef);
  const unpinRef = useAIActionStore((s) => s.unpinRef);
  const pinnedRefs = useAIActionStore((s) => s.pinnedRefs);
  const { open: openBatchAction } = useBatchAction();

  const approvalActions = useApprovalActions();
  const [approvalExpanded, setApprovalExpanded] = useState<Set<number>>(new Set());
  // Per-insight-row loading flag for the "一键通过低风险" button while we
  // run the AI + form-data filter pass before opening the confirm modal.
  const [batchFilterLoading, setBatchFilterLoading] = useState<Set<number>>(new Set());

  const runLowRiskBatch = async (idx: number, candidates: PendingTaskEnriched[]) => {
    if (candidates.length === 0) return;
    setBatchFilterLoading((prev) => new Set(prev).add(idx));
    try {
      const { passedIds, dropped } = await filterLowRiskBatch(qc, candidates);
      approvalActions.confirmBatchApprove(passedIds, {
        totalCandidates: candidates.length,
        dropped,
      });
    } catch (err) {
      message.error(describeApiError(err, '过滤低风险任务失败，请稍后重试'));
    } finally {
      setBatchFilterLoading((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };
  // Local optimistic bookkeeping so the inline alert action buttons switch
  // to a "已处理" state immediately after click, before the re-fetch replaces
  // the row. Keyed by alert id, value is the action that was taken.
  const [alertHandled, setAlertHandled] = useState<Record<string, 'acknowledged' | 'false_positive'>>({});
  const toggleApproval = (idx: number) =>
    setApprovalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const { data: pendingData } = useQuery({
    queryKey: ['pendingEnriched', { assigneeId: user?.id }],
    queryFn: () => getPendingEnriched({ page: 1, size: 50, assigneeId: user?.id }),
    enabled: !!user?.id,
  });
  const allPendingTasks = pendingData?.data ?? [];

  // Class distribution badge data — only in counselor aggregate view (drawer is single-class already).
  const classDistEnabled = role === 'counselor' && (classId == null || classId === '');
  const { data: roster = [] } = useQuery({
    queryKey: ['classRoster'],
    queryFn: getClassRoster,
    staleTime: 5 * 60 * 1000,
    enabled: classDistEnabled,
  });
  const studentClassMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster) {
      if (r.user_id != null) m.set(String(r.user_id), r.class_name ?? '未分班');
    }
    return m;
  }, [roster]);

  const actionBizHint = (it: InsightItem): 'leave' | 'workstudy_application' | null => {
    const page = it.action?.payload?.page;
    if (page === 'leave') return 'leave';
    if (page === 'work-study' || page === 'workstudy') return 'workstudy_application';
    // Aggregate insights (e.g. category=审批堆积) often arrive with no
    // action.payload.page — infer biz from title/category so the batch +
    // accordion UI still surfaces instead of degrading to text-only.
    const haystack = `${it.category ?? ''} ${it.title ?? ''}`;
    if (haystack.includes('请假') && (haystack.includes('审批') || haystack.includes('待审'))) {
      return 'leave';
    }
    if (haystack.includes('勤工') || haystack.includes('助学')) {
      return 'workstudy_application';
    }
    return null;
  };

  const matchInsightTasks = (it: InsightItem): PendingTaskEnriched[] => {
    const studentIds = new Set<string>();
    const leaveIds = new Set<string>();
    for (const raw of it.refs ?? []) {
      const r = normalizeRef(raw);
      if (!r || !r.id) continue;
      if (r.type === 'student') studentIds.add(r.id);
    }
    if (it.action?.type === 'pin_and_review') {
      for (const ref of it.action.payload?.refs ?? []) {
        if (ref?.type === 'leave' && ref.id != null) leaveIds.add(String(ref.id));
      }
    }
    const exact = allPendingTasks.filter((t) => {
      if (t.biz_type === 'leave' && t.biz_id && leaveIds.has(t.biz_id)) return true;
      if (t.initiator_id && studentIds.has(t.initiator_id)) return true;
      return false;
    });
    if (exact.length > 0) return exact;
    // Aggregate insight (e.g. 审批堆积) with no specific ref but a clear biz target.
    const bizHint = actionBizHint(it);
    if (bizHint) {
      return allPendingTasks.filter((t) => t.biz_type === bizHint);
    }
    return [];
  };

  // Pinning an insight also forwards its underlying concrete refs
  // (student / alert) so the chat has real ids, not just
  // "I pinned this insight, figure out what it talks about".
  const forwardableRefs = (it: InsightItem): PinnedRef[] => {
    const out: PinnedRef[] = [];
    for (const raw of it.refs ?? []) {
      const n = normalizeRef(raw);
      if (!n || !n.id) continue;
      if (n.type === 'student' || n.type === 'alert') {
        out.push({ type: n.type, id: n.id, label: n.label });
      }
    }
    return out;
  };

  const scopeKey: Array<string | number | null> = classId != null ? ['insight', role, 'class', classId] : ['insight', role];
  const { data, isLoading } = useQuery<WorkspaceInsight | null>({
    queryKey: scopeKey,
    queryFn: () => getLatestInsight(role, classId),
  });

  // 危机线索：crisis 是与 care 并行的安全例外通道，**刻意不入 insight
  // metrics / 不喂 LLM**（设计红线）。前端直接拉 listCrisisSignals —
  // 服务端已按角色收窄（辅导员只见本人学生、管理角色见全部），与关怀
  // 工作台危机泳道同源同 queryKey。同一学生多条 pending 折叠成一行。
  const { data: crisisList = [] } = useQuery<CrisisSignalListItem[]>({
    queryKey: ['crisis.list'],
    queryFn: listCrisisSignals,
  });
  const crisisGroups = useMemo(() => {
    const m = new Map<
      number,
      { studentId: number; studentName: string; count: number; latestSignalId: number; latestAt: string }
    >();
    for (const c of crisisList) {
      const g = m.get(c.student_id);
      if (!g) {
        m.set(c.student_id, {
          studentId: c.student_id,
          studentName: c.student_name ?? '未知学生',
          count: 1,
          latestSignalId: c.signal_id,
          latestAt: c.created_at,
        });
      } else {
        g.count += 1;
        if (c.created_at > g.latestAt) {
          g.latestAt = c.created_at;
          g.latestSignalId = c.signal_id;
        }
      }
    }
    return [...m.values()];
  }, [crisisList]);

  // metrics.recent_alerts is the list of open 主动关怀 (care_task) rows the
  // backend pinned to the insight (student_alert retired — A1 hard-cut). We
  // look up by id so an `alert` ref (ref type kept as the internal string
  // "alert" — invisible to users) can render real context (student name +
  // care rule) plus the inline 受理/误报/发起谈话 actions.
  interface RecentAlertRow {
    id: string;
    student_id: string;
    student_name: string;
    severity: CareSeverity;
    rule_name: string;
    // care 7 态状态机：受理(ACCEPT) 仅 pending/overdue 合法、误报(REJECT) 仅
    // pending/accepted 合法（CareTaskTransitions）。按 status 网关按钮，
    // 否则对 in_progress 等非法态调用会 400；其余处置去详情页（关怀工作台同款）。
    status: CareStatus;
  }
  const alertMap = useMemo<Map<string, RecentAlertRow>>(() => {
    const m = new Map<string, RecentAlertRow>();
    if (!data?.metrics) return m;
    try {
      const parsed = JSON.parse(data.metrics);
      const rows = Array.isArray(parsed?.recent_alerts) ? parsed.recent_alerts : [];
      for (const r of rows) {
        if (!r?.id) continue;
        m.set(String(r.id), {
          id: String(r.id),
          student_id: String(r.student_id ?? ''),
          student_name: String(r.student_name ?? '未知学生'),
          severity: (r.severity ?? 'medium') as CareSeverity,
          rule_name: String(r.rule_name ?? '关怀任务'),
          status: String(r.status ?? '') as CareStatus,
        });
      }
    } catch {
      // metrics JSON malformed → empty map, card degrades to refs-only chips.
    }
    return m;
  }, [data?.metrics]);

  const alertActionMut = useMutation({
    // care_task 动作映射：acknowledge → 受理（accept），false_positive → 误报
    // （reject reason=rule_not_applicable：关闭任务并回写规则效果反馈）。
    // action 联合保持 acknowledge/false_positive 字面量不变，仅改其语义，
    // 以免动到下方 loading 判定等无关代码。
    mutationFn: async (input: { id: string; action: 'acknowledge' | 'false_positive' }) => {
      if (input.action === 'acknowledge') await acceptCareTask(input.id);
      else await rejectCareTask(input.id, 'rule_not_applicable');
      return input;
    },
    onSuccess: (input) => {
      setAlertHandled((prev) => ({
        ...prev,
        [input.id]: input.action === 'acknowledge' ? 'acknowledged' : 'false_positive',
      }));
      message.success(input.action === 'acknowledge' ? '已受理' : '已标记误报');
      qc.invalidateQueries({ queryKey: ['careSummary'] });
    },
    onError: (e: unknown) => message.warning(describeApiError(e, '操作失败，请稍后再试')),
  });

  interface NotificationTaskRow {
    id: string;
    title: string;
    level: string;
    total_recipients: number;
    confirmed_recipients: number;
    created_at?: string;
  }
  interface CollectionFormRow {
    id: string;
    title: string;
    expected: number;
    submitted: number;
    deadline?: string | null;
  }
  const notifMap = useMemo<Map<string, NotificationTaskRow>>(() => {
    const m = new Map<string, NotificationTaskRow>();
    if (!data?.metrics) return m;
    try {
      const parsed = JSON.parse(data.metrics);
      const rows = Array.isArray(parsed?.notifications_in_progress) ? parsed.notifications_in_progress : [];
      for (const r of rows) {
        if (!r?.id) continue;
        m.set(String(r.id), {
          id: String(r.id),
          title: String(r.title ?? '通知任务'),
          level: String(r.level ?? 'normal'),
          total_recipients: Number(r.total_recipients ?? 0) || 0,
          confirmed_recipients: Number(r.confirmed_recipients ?? 0) || 0,
          created_at: r.created_at ?? undefined,
        });
      }
    } catch { /* malformed metrics → empty */ }
    return m;
  }, [data?.metrics]);
  const formMap = useMemo<Map<string, CollectionFormRow>>(() => {
    const m = new Map<string, CollectionFormRow>();
    if (!data?.metrics) return m;
    try {
      const parsed = JSON.parse(data.metrics);
      const rows = Array.isArray(parsed?.collections_in_progress) ? parsed.collections_in_progress : [];
      for (const r of rows) {
        if (!r?.id) continue;
        m.set(String(r.id), {
          id: String(r.id),
          title: String(r.title ?? '收集表单'),
          expected: Number(r.expected ?? 0) || 0,
          submitted: Number(r.submitted ?? 0) || 0,
          deadline: r.deadline ?? null,
        });
      }
    } catch { /* malformed metrics → empty */ }
    return m;
  }, [data?.metrics]);

  const [remindSent, setRemindSent] = useState<Set<string>>(new Set());
  const remindMut = useMutation({
    mutationFn: (formId: string) => remindForm(formId),
    onSuccess: (_void, formId) => {
      setRemindSent((prev) => new Set(prev).add(formId));
      message.success('已发送催办提醒');
    },
    onError: (e: unknown) => message.warning(describeApiError(e, '催办失败，请稍后再试')),
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshInsight(role, classId),
    onSuccess: (row) => {
      qc.setQueryData(scopeKey, row);
      if (row?.status === 'error') {
        message.warning(row.error_message || 'Agent 生成失败');
      } else {
        message.success('已重新分析');
      }
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string; code?: string } } };
      const msg = e?.response?.data?.message || '刷新失败，请稍后再试';
      message.warning(msg);
    },
  });

  const feedbackMut = useMutation({
    mutationFn: ({ itemIndex, action }: { itemIndex: number; action: 'up' | 'down' }) => {
      if (!data?.id) return Promise.reject(new Error('no insight id'));
      return submitInsightFeedback(data.id, itemIndex, action);
    },
    onSuccess: (_void, { itemIndex, action }) => {
      qc.setQueryData<WorkspaceInsight | null>(scopeKey, (prev) => {
        if (!prev) return prev;
        const key = String(itemIndex);
        const prevVote = prev.user_votes?.[key];
        const cur = prev.feedback_counts?.[key] ?? { up: '0', down: '0' };
        const asNum = { up: Number(cur.up) || 0, down: Number(cur.down) || 0 };
        if (prevVote === 'up') asNum.up = Math.max(0, asNum.up - 1);
        if (prevVote === 'down') asNum.down = Math.max(0, asNum.down - 1);
        asNum[action] = asNum[action] + 1;
        return {
          ...prev,
          feedback_counts: {
            ...(prev.feedback_counts ?? {}),
            [key]: { up: String(asNum.up), down: String(asNum.down) },
          },
          user_votes: { ...(prev.user_votes ?? {}), [key]: action },
        };
      });
    },
    onError: (e: unknown) => message.warning(describeApiError(e, '反馈提交失败，请稍后重试')),
  });

  const items: InsightItem[] = useMemo(() => {
    const raw = parseInsights(data?.insights);
    return [...raw].sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    );
  }, [data?.insights]);

  const generatedLabel = data?.generated_at
    ? dayjs(data.generated_at).format('MM-DD HH:mm')
    : '尚未生成';

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <span className={styles.headIcon}>
            <BulbOutlined />
          </span>
          <span className={styles.headTitle}>{title}</span>
          <span className={styles.headMeta}>
            {data?.model ? data.model : '—'} · {generatedLabel}
          </span>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined spin={refreshMut.isPending} />}
          onClick={() => refreshMut.mutate()}
          loading={refreshMut.isPending}
        >
          重新分析
        </Button>
      </div>

      {crisisGroups.length > 0 && (
        <div
          style={{
            border: '1px solid #ffccc7',
            background: '#fff2f0',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              color: '#cf1322',
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            <WarningFilled />
            <span>危机 · 需立即人工核实 · {crisisGroups.length} 例</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {crisisGroups.map((g) => (
              <div
                key={g.studentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: '#fff',
                  border: '1px solid #ffccc7',
                  borderRadius: 6,
                }}
              >
                <span style={{ fontWeight: 600, color: '#cf1322' }}>{g.studentName}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#a8071a' }}>
                  · 危机求助 · {g.count > 1 ? `${g.count} 次未核实` : '需核实'}
                </span>
                <Button
                  size="small"
                  danger
                  type="primary"
                  onClick={() => navigate(`/crisis/${g.latestSignalId}`)}
                >
                  立即核实
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.empty}>
          <Spin size="small" />
        </div>
      ) : !data ? (
        <div className={styles.empty}>尚未生成分析，点击「重新分析」触发。</div>
      ) : data.status === 'error' ? (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>Agent 生成失败</div>
          <div className={styles.errorDetail}>{data.error_message || '请稍后重试'}</div>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>当前无明显异常，一切正常。</div>
      ) : (
        <div className={styles.list}>
          {items.map((it, idx) => {
            const matchedTasksRaw = matchInsightTasks(it);
            const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
            const matchedTasks = [...matchedTasksRaw].sort(
              (a, b) => (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9),
            );
            const hasApprovals = matchedTasks.length > 0;
            const lowRiskIds = matchedTasks.filter((t) => t.risk_level === 'low').map((t) => t.id);
            const mediumCount = matchedTasks.filter((t) => t.risk_level === 'medium').length;
            const highCount = matchedTasks.filter((t) => t.risk_level === 'high').length;
            const isApprovalOpen = approvalExpanded.has(idx);
            const hideLegacyAction =
              hasApprovals &&
              (it.action?.type === 'pin_and_review' || actionBizHint(it) !== null);
            return (
            <div key={idx} className={`${styles.item} ${styles[`sev_${it.severity}`] ?? ''}`}>
              <div className={styles.itemHead}>
                <span className={`${styles.sevBadge} ${styles[`sevBadge_${it.severity}`] ?? ''}`}>
                  {SEVERITY_LABELS[it.severity] ?? it.severity}
                </span>
                <Tag className={styles.catTag}>{it.category}</Tag>
                <span className={styles.itemTitle}>{it.title}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {(() => {
                    // For aggregate insights (e.g. 待审批请假积压6条), it.refs carries
                    // only metric refs, so forwardableRefs() yields []. The concrete
                    // applicants live on matchedTasks — pin them too, with a risk-tagged
                    // label, so asking "此处高风险人员…" has a single unambiguous referent.
                    const RISK_TAG: Record<string, string> = {
                      high: '高风险',
                      medium: '中风险',
                      low: '低风险',
                    };
                    const matchedStudentRefs: PinnedRef[] = [];
                    const seenStudentIds = new Set<string>();
                    for (const t of matchedTasks) {
                      const sid = t.initiator_id;
                      if (!sid || seenStudentIds.has(sid)) continue;
                      seenStudentIds.add(sid);
                      matchedStudentRefs.push({
                        type: 'student',
                        id: String(sid),
                        label: `${t.initiator_name ?? '未知'}（${RISK_TAG[t.risk_level] ?? '风险未知'}）`,
                      });
                    }
                    // Summarise applicants inside the insight detail so the LLM also
                    // sees the mapping from system prompt text, not just refs.
                    const riskSummaryParts: string[] = [];
                    if (highCount > 0) {
                      const names = matchedTasks
                        .filter((t) => t.risk_level === 'high')
                        .map((t) => `${t.initiator_name ?? '未知'}(id=${t.initiator_id ?? '?'})`)
                        .join('、');
                      riskSummaryParts.push(`高风险：${names}`);
                    }
                    if (mediumCount > 0) {
                      const names = matchedTasks
                        .filter((t) => t.risk_level === 'medium')
                        .map((t) => `${t.initiator_name ?? '未知'}(id=${t.initiator_id ?? '?'})`)
                        .join('、');
                      riskSummaryParts.push(`中风险：${names}`);
                    }
                    const detailWithApplicants = riskSummaryParts.length > 0
                      ? `${it.category} · ${it.severity} · ${it.detail} | ${riskSummaryParts.join('；')}`
                      : `${it.category} · ${it.severity} · ${it.detail}`;
                    const insightRef: PinnedRef = {
                      type: 'insight',
                      id: `${data?.id ?? ''}:${idx}`,
                      label: it.title,
                      detail: detailWithApplicants.slice(0, 400),
                    };
                    // Drop any student ref already covered by matchedTasks (with richer risk label).
                    const fromInsightRefs = forwardableRefs(it).filter(
                      (r) => !(r.type === 'student' && seenStudentIds.has(r.id)),
                    );
                    const extra = [...fromInsightRefs, ...matchedStudentRefs];
                    const pinned = pinnedRefs.some(
                      (r) => r.type === insightRef.type && r.id === insightRef.id,
                    );
                    const tip = pinned
                      ? '从 AI 上下文移除'
                      : extra.length > 0
                        ? `加入 AI 上下文（连同 ${extra.length} 位学生/对象）`
                        : '加入 AI 上下文';
                    return (
                      <Tooltip title={tip}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (pinned) {
                              unpinRef(insightRef.type, insightRef.id);
                            } else {
                              pinRef(insightRef);
                              extra.forEach((r) => pinRef(r));
                              const suffix = extra.length > 0 ? `（+${extra.length} 个对象）` : '';
                              message.success({
                                content: `已加入 AI 上下文：${it.title}${suffix}`,
                                duration: 1.5,
                              });
                            }
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 22,
                            height: 22,
                            padding: 0,
                            border: 'none',
                            background: pinned ? 'rgba(94, 143, 255, 0.16)' : 'transparent',
                            color: pinned ? '#5e8fff' : 'var(--fg-3, #888)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            lineHeight: 1,
                            transition: 'background 0.15s, color 0.15s',
                          }}
                        >
                          {pinned ? <PushpinFilled /> : <PushpinOutlined />}
                        </button>
                      </Tooltip>
                    );
                  })()}
                </span>
              </div>
              {(() => {
                if (!classDistEnabled || studentClassMap.size === 0) return null;
                const sids = new Set<string>();
                for (const raw of it.refs ?? []) {
                  const r = normalizeRef(raw);
                  if (r?.type === 'student' && r.id) sids.add(r.id);
                }
                for (const t of matchedTasks) {
                  if (t.initiator_id) sids.add(String(t.initiator_id));
                }
                if (sids.size === 0) return null;
                const counts = new Map<string, number>();
                for (const sid of sids) {
                  const cn = studentClassMap.get(sid) ?? '未分班';
                  counts.set(cn, (counts.get(cn) ?? 0) + 1);
                }
                const dist = Array.from(counts.entries())
                  .map(([className, count]) => ({ className, count }))
                  .sort((a, b) => b.count - a.count);
                const total = dist.reduce((s, d) => s + d.count, 0);
                if (dist.length === 1) {
                  return (
                    <div className={styles.classDist}>
                      <span className={styles.classDistLabel}>涉及</span>
                      <span className={styles.classDistSingle}>
                        {dist[0].className}（{dist[0].count} 人）
                      </span>
                    </div>
                  );
                }
                return (
                  <div className={styles.classDist}>
                    <span className={styles.classDistLabel}>涉及</span>
                    <div className={styles.classDistBar} title={dist.map((d) => `${d.className} ${d.count}`).join(' · ')}>
                      {dist.map((d, i) => {
                        const pct = (d.count / total) * 100;
                        return (
                          <span
                            key={i}
                            className={styles.classDistSeg}
                            style={{ width: `${pct}%` }}
                          >
                            {pct >= 18 ? `${d.className} ${d.count}` : ''}
                          </span>
                        );
                      })}
                    </div>
                    <span className={styles.classDistTotal}>共 {total}</span>
                  </div>
                );
              })()}
              {it.detail && <div className={styles.itemDetail}>{it.detail}</div>}
              {it.evidence && it.evidence.length > 0 && (
                <div className={styles.evidence}>
                  <DatabaseOutlined className={styles.evidenceIcon} />
                  <div className={styles.evidenceList}>
                    {it.evidence.map((e, i) => (
                      <div key={i} className={styles.evidenceLine}>{e}</div>
                    ))}
                  </div>
                </div>
              )}
              {it.suggestion && (
                <div className={styles.suggest}>
                  <span className={styles.suggestLabel}>建议</span>
                  <span>{it.suggestion}</span>
                </div>
              )}
              {(() => {
                // 行以后端权威 recent_alerts(alertMap) 为准，**不**依赖 LLM
                // 实际吐了几个 alert ref —— DeepSeek 常只 ref 紧急的、漏掉其余，
                // 导致"标题说4条只渲染2行"。只要该洞察引用了关怀任务(有任一
                // alert ref)，就把全部待处理 care_task 渲染出来；alertMap 保留
                // SQL 的严重度排序(critical→…→low)。
                const hasAlertRef = (it.refs ?? []).some(
                  (raw) => normalizeRef(raw)?.type === 'alert',
                );
                const rows: RecentAlertRow[] = hasAlertRef
                  ? [...alertMap.values()]
                  : [];
                if (rows.length === 0) return null;
                return (
                  <div className={styles.alertInline}>
                    {rows.map((row) => {
                      const handled = alertHandled[row.id];
                      const pending = alertActionMut.isPending && alertActionMut.variables?.id === row.id;
                      return (
                        <div key={row.id} className={`${styles.alertRow} ${styles[`sevBadge_${row.severity === 'high' ? 'warn' : row.severity === 'critical' ? 'critical' : 'info'}`] ?? ''}`}>
                          <span className={`${styles.sevBadge} ${styles[`sevBadge_${row.severity === 'high' ? 'warn' : row.severity === 'critical' ? 'critical' : 'info'}`] ?? ''}`}>
                            {SEVERITY_ZH[row.severity] ?? row.severity}
                          </span>
                          <span className={styles.alertText}>
                            <span
                              className={styles.alertStudent}
                              onClick={() => navigate(`/student?studentId=${row.student_id}&tab=timeline`)}
                            >
                              {row.student_name}
                            </span>
                            <span
                              className={styles.alertRule}
                              title="查看关怀任务详情"
                              onClick={() => navigate(`/care/task/${row.id}`)}
                            >
                              · {row.rule_name}
                            </span>
                          </span>
                          <span className={styles.alertActions}>
                            {handled ? (
                              <span className={styles.alertDone}>
                                <CheckCircleOutlined /> {handled === 'acknowledged' ? '已受理' : '已标误报'}
                              </span>
                            ) : (
                              <>
                                {(row.status === 'pending' || row.status === 'overdue') && (
                                  <Button
                                    size="small"
                                    icon={<CheckCircleOutlined />}
                                    loading={pending && alertActionMut.variables?.action === 'acknowledge'}
                                    onClick={() => alertActionMut.mutate({ id: row.id, action: 'acknowledge' })}
                                  >
                                    受理
                                  </Button>
                                )}
                                {(row.status === 'accepted' || row.status === 'in_progress' || row.status === 'overdue') && (
                                  <Button
                                    size="small"
                                    icon={<FlagOutlined />}
                                    title="去详情页填结案备注后完成"
                                    onClick={() => navigate(`/care/task/${row.id}`)}
                                  >
                                    完成
                                  </Button>
                                )}
                                {(row.status === 'pending' || row.status === 'accepted') && (
                                  <Button
                                    size="small"
                                    icon={<StopOutlined />}
                                    loading={pending && alertActionMut.variables?.action === 'false_positive'}
                                    onClick={() => alertActionMut.mutate({ id: row.id, action: 'false_positive' })}
                                  >
                                    误报
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<MessageOutlined />}
                                  onClick={() => {
                                    const params = new URLSearchParams({
                                      studentId: row.student_id,
                                      careTaskId: row.id,
                                      context: row.rule_name,
                                    });
                                    navigate(`/counselor-talks?${params.toString()}`);
                                  }}
                                >
                                  发起谈话
                                </Button>
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {(() => {
                const notifRows: NotificationTaskRow[] = [];
                const formRows: CollectionFormRow[] = [];
                const seenNotif = new Set<string>();
                const seenForm = new Set<string>();
                for (const raw of it.refs ?? []) {
                  const r = normalizeRef(raw);
                  if (!r || !r.id) continue;
                  if (r.type === 'notification' && !seenNotif.has(r.id)) {
                    const row = notifMap.get(r.id);
                    if (row) { notifRows.push(row); seenNotif.add(r.id); }
                  } else if (r.type === 'form' && !seenForm.has(r.id)) {
                    const row = formMap.get(r.id);
                    if (row) { formRows.push(row); seenForm.add(r.id); }
                  }
                }
                if (notifRows.length === 0 && formRows.length === 0) return null;
                return (
                  <div className={styles.taskInline}>
                    {notifRows.map((row) => {
                      const pending = Math.max(0, row.total_recipients - row.confirmed_recipients);
                      const ratio = row.total_recipients > 0
                        ? Math.round((row.confirmed_recipients / row.total_recipients) * 100)
                        : 0;
                      return (
                        <div key={`n-${row.id}`} className={styles.taskRow}>
                          <span className={styles.taskIcon}><NotificationOutlined /></span>
                          <span className={styles.taskText}>
                            <span className={styles.taskTitle}>{row.title}</span>
                            <span className={styles.taskMeta}>
                              已确认 {row.confirmed_recipients}/{row.total_recipients}（{ratio}%）· 未读 {pending}
                            </span>
                          </span>
                          <span className={styles.taskBar}>
                            <span className={styles.taskBarFill} style={{ width: `${ratio}%` }} />
                          </span>
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => navigate('/notification')}
                          >
                            查看
                          </Button>
                        </div>
                      );
                    })}
                    {formRows.map((row) => {
                      const pending = Math.max(0, row.expected - row.submitted);
                      const ratio = row.expected > 0
                        ? Math.round((row.submitted / row.expected) * 100)
                        : 0;
                      const sent = remindSent.has(row.id);
                      const dueSoon = row.deadline && dayjs(row.deadline).diff(dayjs(), 'hour') < 48;
                      return (
                        <div key={`f-${row.id}`} className={`${styles.taskRow} ${dueSoon ? styles.taskRowUrgent : ''}`}>
                          <span className={styles.taskIcon}><FormOutlined /></span>
                          <span className={styles.taskText}>
                            <span className={styles.taskTitle}>{row.title}</span>
                            <span className={styles.taskMeta}>
                              已提交 {row.submitted}/{row.expected}（{ratio}%）· 未交 {pending}
                              {row.deadline && ` · 截止 ${dayjs(row.deadline).format('MM-DD HH:mm')}`}
                            </span>
                          </span>
                          <span className={styles.taskBar}>
                            <span className={styles.taskBarFill} style={{ width: `${ratio}%` }} />
                          </span>
                          {sent ? (
                            <span className={styles.alertDone}>
                              <CheckCircleOutlined /> 已催办
                            </span>
                          ) : (
                            <Button
                              size="small"
                              type="primary"
                              icon={<SendOutlined />}
                              loading={remindMut.isPending && remindMut.variables === row.id}
                              onClick={() => remindMut.mutate(row.id)}
                            >
                              催办
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {it.action && !hideLegacyAction && (
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => {
                      const a = it.action!;
                      if (a.type === 'pin_and_review') {
                        const refs = (a.payload?.refs ?? []).map((r) => ({
                          type: String(r.type),
                          id: String(r.id),
                          label: String(r.label ?? r.id),
                          detail: r.detail,
                        }));
                        const leaveRefs = refs.filter((r) => r.type === 'leave');
                        if (leaveRefs.length > 0) {
                          // Primary engineered path: open the right-side batch
                          // execution drawer. Also pin the refs so the AI still
                          // has them as context if the user types a question.
                          refs.forEach((r) => pinRef(r));
                          void openBatchAction({
                            actionType: 'leave_approve',
                            refs: leaveRefs,
                            title: a.label,
                          });
                        } else {
                          // Fallback for non-leave refs: keep the original
                          // pin-and-navigate behavior until more executors land.
                          refs.forEach((r) => pinRef(r));
                          message.success(`已固定 ${refs.length} 个对象到 AI 上下文`);
                          if (a.payload?.page) navigate(`/${a.payload.page}`);
                        }
                      } else if (a.type === 'navigate' && a.payload?.page) {
                        const params = a.payload.params
                          ? '?' + new URLSearchParams(a.payload.params).toString()
                          : '';
                        navigate(`/${a.payload.page}${params}`);
                      }
                    }}
                  >
                    <ThunderboltOutlined />
                    {it.action.label}
                  </button>
                </div>
              )}
              {hasApprovals && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--fg-3)',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>待处理 {matchedTasks.length} 条</span>
                    <span style={{ color: 'var(--fg-5)' }}>·</span>
                    {lowRiskIds.length > 0 && (
                      <span style={{ color: '#059669' }}>低 {lowRiskIds.length}</span>
                    )}
                    {mediumCount > 0 && (
                      <span style={{ color: '#b45309' }}>中 {mediumCount}</span>
                    )}
                    {highCount > 0 && (
                      <span style={{ color: '#dc2626' }}>高 {highCount}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Tooltip
                      title={
                        lowRiskIds.length > 0
                          ? '低风险 = 近 30 天无旷课、无未处理违纪、无开放预警；近 30 天请假 < 3 次；本次请假 ≤ 3 天。点击后会先调用 AI 二次审核与硬性兜底（出境目的地 / 模糊事由），剔除不可批的再确认。'
                          : '当前待审批均为中/高风险，需逐条审核。'
                      }
                    >
                      <Button
                        size="small"
                        type="primary"
                        disabled={lowRiskIds.length === 0}
                        loading={
                          batchFilterLoading.has(idx) || approvalActions.batchMutation.isPending
                        }
                        onClick={() =>
                          runLowRiskBatch(
                            idx,
                            matchedTasks.filter((t) => t.risk_level === 'low'),
                          )
                        }
                      >
                        {batchFilterLoading.has(idx)
                          ? `AI 二次审核中（${lowRiskIds.length}）…`
                          : `一键通过低风险（${lowRiskIds.length}）`}
                      </Button>
                    </Tooltip>
                    <Button size="small" onClick={() => toggleApproval(idx)}>
                      {isApprovalOpen ? '收起审批' : `逐条审批（${matchedTasks.length}）`}
                    </Button>
                  </div>
                  {isApprovalOpen && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {matchedTasks.map((t) => (
                        <PendingApprovalRow
                          key={t.id}
                          task={t}
                          expanded={approvalActions.expanded.has(t.id)}
                          onToggleExpand={() => approvalActions.toggleExpand(t.id)}
                          approveComment={approvalActions.approveComments[t.id] ?? ''}
                          onApproveCommentChange={(v) => approvalActions.setApproveComment(t.id, v)}
                          onApprove={() => approvalActions.approve(t)}
                          onReject={() => approvalActions.openReject(t)}
                          isApprovePending={approvalActions.isApprovePending(t.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {it.refs && it.refs.length > 0 && (
                <div className={styles.refs}>
                  {it.refs
                    .map((ref) => normalizeRef(ref))
                    .filter((r): r is InsightRef => r !== null)
                    .filter((r) => !(r.type === 'alert' && alertMap.has(r.id)))
                    .filter((r) => !(r.type === 'notification' && notifMap.has(r.id)))
                    .filter((r) => !(r.type === 'form' && formMap.has(r.id)))
                    .map((ref, i) => {
                      const linkable = ref.type === 'student' && ref.id;
                      const cls = `${styles.refTag} ${styles[`refTag_${ref.type}`] ?? ''} ${linkable ? styles.refTagLink : ''}`;
                      return (
                        <span
                          key={i}
                          className={cls}
                          onClick={
                            linkable
                              ? () => navigate(`/student?studentId=${ref.id}&tab=timeline`)
                              : undefined
                          }
                          title={ref.id ? `${ref.type}: ${ref.id}` : ref.type}
                        >
                          {ref.label}
                        </span>
                      );
                    })}
                </div>
              )}
              {data?.id != null && (() => {
                const key = String(idx);
                const counts = data.feedback_counts?.[key] ?? { up: '0', down: '0' };
                const upN = Number(counts.up) || 0;
                const downN = Number(counts.down) || 0;
                const myVote = data.user_votes?.[key];
                const isPending = feedbackMut.isPending && feedbackMut.variables?.itemIndex === idx;
                return (
                  <div className={styles.feedbackRow}>
                    <span className={styles.fbLabel}>这条洞察有用吗？</span>
                    <button
                      type="button"
                      className={`${styles.fbBtn} ${myVote === 'up' ? styles.fbBtnActiveUp : ''}`}
                      disabled={isPending}
                      onClick={() => feedbackMut.mutate({ itemIndex: idx, action: 'up' })}
                      title="有用"
                    >
                      <LikeOutlined />
                      {upN > 0 ? upN : ''}
                    </button>
                    <button
                      type="button"
                      className={`${styles.fbBtn} ${myVote === 'down' ? styles.fbBtnActiveDown : ''}`}
                      disabled={isPending}
                      onClick={() => feedbackMut.mutate({ itemIndex: idx, action: 'down' })}
                      title="无用"
                    >
                      <DislikeOutlined />
                      {downN > 0 ? downN : ''}
                    </button>
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      )}
      {allPendingTasks.length > 0 && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Link to="/leave?status=pending" style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            查看全部未审批（{allPendingTasks.length} 条）→
          </Link>
        </div>
      )}
      <ApprovalRejectModal actions={approvalActions} />
    </div>
  );
}
