import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  SendOutlined, CheckCircleOutlined, FormOutlined,
  CalendarOutlined, FileTextOutlined, CheckSquareOutlined, QuestionCircleOutlined,
  CompassOutlined, BulbOutlined, RightOutlined, BookOutlined, PushpinOutlined, CloseOutlined,
  PlusOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import AssistantAvatar, { useAssistantPersona } from '@/components/brand/AssistantAvatar';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useBatchActionStore } from '@/stores/batch-action.store';
import { useLocaleStore } from '@/stores/locale.store';
import { useAuth } from '@/hooks/useAuth';
import BatchActionDrawer from '@/components/batch/BatchActionDrawer';
import api from '@/api';
import styles from './AIPanel.module.css';

/* ── Message types ── */

interface Citation {
  doc_id: string;
  title: string;
}

interface TextMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text';
  content: string;
  citations?: Citation[];
}

interface CardMessage {
  id: string;
  role: 'assistant';
  kind: 'action_card';
  content: string;
  card: {
    type: string;
    fields: { label: string; value: string }[];
  };
}

interface EventMessage {
  id: string;
  role: 'assistant';
  kind: 'event';
  content: string;
  icon: 'success' | 'info';
}

/**
 * 工作流配置改动建议卡。LLM 在 /chat 里 emit propose_workflow_config_change
 * action,AIPanel 调 sidecar /workflow-config/propose 计算 new_yaml,落到这种
 * message 里展示中文 diff + 「确认应用」按钮。零 YAML 暴露。
 */
interface WorkflowProposalMessage {
  id: string;
  role: 'assistant';
  kind: 'workflow_proposal';
  /** 老师的原始指令(展示用) */
  instruction: string;
  /** 业务类型,sidecar /apply 时透传 */
  biz_type: string;
  college_id: number | null;
  /** 中文 diff bullet 列表 */
  diff_zh: string;
  /** 简短摘要,落到 changelog */
  change_summary: string;
  /** LLM 给老师的旁白(影响提示等) */
  ai_message: string;
  /** 后端 apply 用的完整 YAML 文本(老师不可见) */
  new_yaml: string;
  /** AI 提案涉及的假别 code,用于滚动到 #leave-type-{code} 卡 + 高亮闪烁 */
  focus_codes?: string[];
  /** 状态:pending=未点确认,applying=正在写库,applied=已成功,cancelled=取消 */
  status: 'pending' | 'applying' | 'applied' | 'cancelled' | 'failed';
  /** 失败时的错误文本 */
  error?: string;
}

interface NotificationProposalMessage {
  id: string;
  role: 'assistant';
  kind: 'notification_proposal';
  instruction: string;
  /** 中文 diff bullet 列表 */
  diff_zh: string;
  /** LLM 给老师的旁白 */
  ai_message: string;
  /** apply 时 POST 给 backend 的 op pipeline */
  ops: unknown[];
  status: 'pending' | 'applying' | 'applied' | 'cancelled' | 'failed';
  error?: string;
}

type Message = TextMessage | CardMessage | EventMessage | WorkflowProposalMessage | NotificationProposalMessage;

/* ── Helpers ── */

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick_on_campus: '病假（在校）',
  sick_off_campus: '病假（离校）',
  personal: '事假',
  weekend: '周末离校',
  official: '公假',
};

const PAGE_LABELS: Record<string, string> = {
  workspace: '工作台', leave: '请销假', collection: '信息收集',
  checkin: '签到', notification: '我的通知',
  student: '学生信息库',
};

/**
 * Direct-navigation shortcuts shown in the suggestion bar. Click → navigate
 * straight to the feature page (no AI roundtrip). Filtered by hasPermission;
 * permission=null means all roles see it (the page itself handles role-specific
 * rendering, e.g. /leave shows the apply button only for students).
 *
 * Permission codes mirror NavRail.tsx — keep them in sync if NavRail changes.
 */
const QUICK_ROUTES: { label: string; path: string; permission: string | null }[] = [
  { label: '请假', path: '/leave', permission: null },
  { label: '勤工助学', path: '/work-study', permission: null },
  { label: '通知', path: '/notification', permission: null },
  { label: '签到', path: '/checkin', permission: 'checkin:manage' },
  { label: '信息收集', path: '/collection', permission: 'collection:manage' },
  { label: '工作日志', path: '/work-log', permission: 'worklog:manage' },
  { label: '违纪', path: '/violation', permission: 'discipline:manage' },
  { label: '学生信息库', path: '/student', permission: 'student:view' },
  { label: '异常预警', path: '/alerts', permission: 'student:view' },
];

const STUDENT_AI_QUESTIONS = [
  { label: '奖学金', prompt: '奖学金申请条件是什么？' },
  { label: '校规问答', prompt: '学生请假最多能请几天？' },
];

const STAFF_AI_QUESTIONS = [
  { label: '校规问答', prompt: '请假规定是什么？' },
];

/** Quick chips visible only when the user is on /work-study. Each one gives the
 * LLM a specific tool nudge so it picks the right query_tools entry without
 * forcing the user to remember the exact tool name. */
const WORKSTUDY_STUDENT_CHIPS = [
  { label: '按偏好找岗位', prompt: '帮我找几个适合我的勤工助学岗位（可以用我自己描述的偏好筛）' },
  { label: '按时间匹配岗位', prompt: '我有这些空余时间，请按时间覆盖度帮我匹配岗位' },
  { label: '总览', prompt: '用 workstudy_dashboard_brief 给我看下我现在的勤工助学进度' },
];

const WORKSTUDY_STAFF_CHIPS = [
  { label: '今日总览', prompt: '用 workstudy_dashboard_brief 给我播报今天的勤工助学情况' },
  // 候选对比卡的 chip prompt 由渲染时拼接岗位 id（如已 pin），见下方 candidatePrompt 函数
  { label: '候选对比卡', prompt: '__USE_PINNED_POSITION__' },
  { label: '薪资异常扫描', prompt: '扫一下本月薪资有没有金额异常的申报' },
  { label: '新岗位模板', prompt: '基于历史岗位给我一个新岗位发布模板建议' },
];

/** Build the "候选对比卡" prompt at click time using a pinned ref if present. */
function candidatePrompt(pinned: { type: string; id: string }[]): string | null {
  const ref = pinned.find((r) => r.type === 'workstudy_position');
  if (ref) return `用 summarize_workstudy_applicants 把岗位 #${ref.id} 的所有申请压成候选对比卡`;
  return null;
}

function formatDate(s: string) {
  return s?.slice(0, 10) || '';
}

/* ── Component ── */

export default function AIPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { user, isStudent, hasPermission } = useAuth();
  const persona = useAssistantPersona();

  const dispatchAction = useAIActionStore((s) => s.dispatch);
  const panelContext = useAIActionStore((s) => s.panelContext);
  const setContext = useAIActionStore((s) => s.setContext);
  const panelEvent = useAIActionStore((s) => s.panelEvent);
  const consumeEvent = useAIActionStore((s) => s.consumeEvent);
  const pinnedRefs = useAIActionStore((s) => s.pinnedRefs);
  const unpinRef = useAIActionStore((s) => s.unpinRef);
  const clearPinnedRefs = useAIActionStore((s) => s.clearPinnedRefs);
  const emitHighlight = useAIActionStore((s) => s.emitHighlight);
  const inputSeed = useAIActionStore((s) => s.inputSeed);
  const consumeInputSeed = useAIActionStore((s) => s.consumeInputSeed);
  const setHoveredRef = useAIActionStore((s) => s.setHoveredRef);
  const batchOpen = useBatchActionStore((s) => s.open);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * AI 提案滚动到目标假别卡 + 闪 1.5s。LeaveTypeCard 渲染了 id="leave-type-{code}";
   * 找不到 id 静默跳过(LLM 偶尔报错 code,或当前 tab 不在请假规则页都属此类)。
   *
   * 250ms 延迟让 setMessages 触发的 React render + 可能的 tab 切换先完成。
   */
  function flashFocusCodes(codes: string[] | undefined) {
    if (!codes || codes.length === 0) return;
    setTimeout(() => {
      const els = codes
        .map((c) => document.getElementById(`leave-type-${c}`))
        .filter((el): el is HTMLElement => !!el);
      if (els.length === 0) return;
      els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      els.forEach((el) => {
        el.classList.remove('ai-focus-flash');
        // reflow 触发动画重放(连续两次 propose 同一个 code 也能闪)
        void el.offsetWidth;
        el.classList.add('ai-focus-flash');
        setTimeout(() => el.classList.remove('ai-focus-flash'), 2100);
      });
    }, 250);
  }

  /**
   * 跑 workflow 配置改动建议:调 sidecar /propose 拿到 new_yaml + diff_zh,
   * 落成 workflow_proposal 卡片让老师确认。
   */
  async function runWorkflowProposal(bizType: string, collegeId: number | null, instruction: string) {
    const loadingId = (Date.now() + 2).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: loadingId,
        role: 'assistant',
        kind: 'event',
        icon: 'info',
        content: 'AI 正在分析改动…',
      },
    ]);
    try {
      const token = localStorage.getItem('xg_token');
      const tenantId = user?.tenant_id || 'default';
      const userId = user?.id ? String(user.id) : '';
      const res = await fetch('/ai/api/v1/workflow-config/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-User-Id': userId,
          'X-Tenant-Id': tenantId,
          'X-User-Role': user?.role_codes?.[0] || 'school_admin',
        },
        body: JSON.stringify({
          biz_type: bizType,
          college_id: collegeId,
          instruction,
        }),
      });
      const data = await res.json();
      // remove loading
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      if (!data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 3).toString(),
            role: 'assistant',
            kind: 'text',
            content: data.ai_message || `分析失败:${data.error_code || 'UNKNOWN'}`,
          },
        ]);
        // NO_CHANGE 等"未改动但定位到了卡"的场景:仍然滚动 + 高亮,让老师自己确认
        flashFocusCodes(Array.isArray(data.focus_codes) ? data.focus_codes : undefined);
        return;
      }
      // set_term_cap 之类「直接落库不需要二次确认」的 op,sidecar 已经写了
      // backend,new_yaml=null。这种情况下不渲染确认卡,直接显示 ai_message,
      // 顺便刷一下假别字典让请销假配置页的学期上限实时跟新。
      if (!data.new_yaml) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 3).toString(),
            role: 'assistant',
            kind: 'text',
            content: data.ai_message || '✓ 已应用',
          },
        ]);
        queryClient.invalidateQueries({ queryKey: ['leaveTypes'] });
        setTimeout(scrollToBottom, 50);
        flashFocusCodes(Array.isArray(data.focus_codes) ? data.focus_codes : undefined);
        return;
      }
      const proposal: WorkflowProposalMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        kind: 'workflow_proposal',
        instruction,
        biz_type: bizType,
        college_id: collegeId,
        diff_zh: data.diff_zh,
        change_summary: data.change_summary,
        ai_message: data.ai_message,
        new_yaml: data.new_yaml,
        focus_codes: Array.isArray(data.focus_codes) ? data.focus_codes : undefined,
        status: 'pending',
      };
      setMessages((prev) => [...prev, proposal]);
      setTimeout(scrollToBottom, 50);
      // AI 提案落卡同步滚动到目标假别 + 高亮闪 1.5s。延迟 250ms 让卡片先 render。
      flashFocusCodes(proposal.focus_codes);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 4).toString(),
          role: 'assistant',
          kind: 'text',
          content: `AI 服务连接失败:${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    }
  }

  /** 老师点「确认应用」:调 backend POST /workflow-config/apply 写库 + 刷新页面查询。 */
  async function applyWorkflowProposal(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === 'workflow_proposal' ? { ...m, status: 'applying' } : m,
      ),
    );
    const target = messages.find((m): m is WorkflowProposalMessage =>
      m.id === msgId && m.kind === 'workflow_proposal');
    if (!target) return;
    try {
      await api.post('/workflow-config/apply', {
        biz_type: target.biz_type,
        college_id: target.college_id,
        new_yaml: target.new_yaml,
        change_summary: target.change_summary,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.kind === 'workflow_proposal' ? { ...m, status: 'applied' } : m,
        ),
      );
      // 刷新「请销假配置」页摘要
      queryClient.invalidateQueries({ queryKey: ['workflow-config.summary'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.kind === 'workflow_proposal'
            ? { ...m, status: 'failed', error: msg }
            : m,
        ),
      );
    }
  }

  function cancelWorkflowProposal(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === 'workflow_proposal' ? { ...m, status: 'cancelled' } : m,
      ),
    );
  }

  /**
   * 通知中心改动建议:调 sidecar /notification-config/propose 拿到 ops + diff,
   * 落成 notification_proposal 卡片。结构跟 workflow_proposal 相似但 op 模型
   * 不同(无 yaml,直接 op 数组)。
   */
  async function runNotificationProposal(instruction: string) {
    const loadingId = (Date.now() + 2).toString();
    setMessages((prev) => [
      ...prev,
      { id: loadingId, role: 'assistant', kind: 'event', icon: 'info', content: 'AI 正在分析改动…' },
    ]);
    try {
      const token = localStorage.getItem('xg_token');
      const tenantId = user?.tenant_id || 'default';
      const userId = user?.id ? String(user.id) : '';
      const res = await fetch('/ai/api/v1/notification-config/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-User-Id': userId,
          'X-Tenant-Id': tenantId,
          'X-User-Role': user?.role_codes?.[0] || 'school_admin',
        },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json();
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      if (!data.ok) {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 3).toString(), role: 'assistant', kind: 'text',
            content: data.ai_message || `分析失败:${data.error_code || 'UNKNOWN'}` },
        ]);
        return;
      }
      // ops 空 = LLM 反问 / 找不到匹配模板,只显示 ai_message,不渲染确认卡
      if (!Array.isArray(data.ops) || data.ops.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 3).toString(), role: 'assistant', kind: 'text',
            content: data.ai_message || '请告诉我具体想改哪条通知。' },
        ]);
        setTimeout(scrollToBottom, 50);
        return;
      }
      const proposal: NotificationProposalMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        kind: 'notification_proposal',
        instruction,
        diff_zh: data.diff_zh || '',
        ai_message: data.ai_message || '',
        ops: data.ops,
        status: 'pending',
      };
      setMessages((prev) => [...prev, proposal]);
      setTimeout(scrollToBottom, 50);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 4).toString(), role: 'assistant', kind: 'text',
          content: `AI 服务连接失败:${e instanceof Error ? e.message : String(e)}` },
      ]);
    }
  }

  /** 老师点「确认应用」:POST backend /notification-center/apply-ops 写库 + 刷新本页查询。 */
  async function applyNotificationProposal(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === 'notification_proposal' ? { ...m, status: 'applying' } : m,
      ),
    );
    const target = messages.find((m): m is NotificationProposalMessage =>
      m.id === msgId && m.kind === 'notification_proposal');
    if (!target) return;
    try {
      await api.post('/notification-center/apply-ops', { ops: target.ops });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.kind === 'notification_proposal' ? { ...m, status: 'applied' } : m,
        ),
      );
      // 刷新通知中心页的查询
      queryClient.invalidateQueries({ queryKey: ['notifTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['notifPreferences'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.kind === 'notification_proposal'
            ? { ...m, status: 'failed', error: msg }
            : m,
        ),
      );
    }
  }

  function cancelNotificationProposal(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === 'notification_proposal' ? { ...m, status: 'cancelled' } : m,
      ),
    );
  }

  // Track current page from URL
  useEffect(() => {
    const page = location.pathname.split('/')[1] || 'workspace';
    setContext({ page });
  }, [location.pathname, setContext]);

  // Seeded input from workspace rows: pre-fill the input, focus it, and
  // auto-send when the seed requests it. The seed is consumed once to avoid
  // re-applying on any future re-render.
  useEffect(() => {
    if (!inputSeed) return;
    if (inputSeed.send) {
      consumeInputSeed();
      void handleSend(inputSeed.text);
    } else {
      setInput(inputSeed.text);
      consumeInputSeed();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    // handleSend is intentionally omitted — it's stable in practice and
    // re-triggering on its identity would cause a seed to be consumed twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputSeed]);

  // Listen for panel events (e.g., form submitted) → append to chat
  useEffect(() => {
    if (!panelEvent) return;
    const { type, data } = panelEvent;

    if (type === 'leave_submitted') {
      const typeName = LEAVE_TYPE_LABELS[data?.leave_type_code as string] || '请假';
      const msg: EventMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        kind: 'event',
        icon: 'success',
        content: `${typeName}申请已提交！事由：${data?.reason || '-'}，时间：${formatDate(data?.start_time as string)} ~ ${formatDate(data?.end_time as string)}。需要我帮您做其他事吗？`,
      };
      setMessages((prev) => [...prev, msg]);
      setTimeout(scrollToBottom, 50);
    }
    consumeEvent();
  }, [panelEvent, consumeEvent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;

    if (!text) setInput('');

    // Pinned refs are sticky — they travel with every message until the user
    // explicitly removes them (X on the chip) or clears the whole row. This matches
    // the mental model of "selecting a subject, then asking about it repeatedly".
    const refsSnapshot = pinnedRefs.slice();

    const userMsg: TextMessage = { id: Date.now().toString(), role: 'user', kind: 'text', content: msgText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setTimeout(scrollToBottom, 50);

    try {
      const token = localStorage.getItem('xg_token');
      const tenantId = user?.tenant_id || 'default';
      const userId = user?.id ? String(user.id) : '';
      const userLang = useLocaleStore.getState().lang;
      const res = await fetch('/ai/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'X-User-Id': userId,
          'X-Tenant-Id': tenantId,
          'X-User-Lang': userLang,
        },
        body: JSON.stringify({
          message: msgText,
          conversation_id: conversationId || undefined,
          history: messages
            .filter((m): m is TextMessage => m.kind === 'text')
            .map((m) => ({ role: m.role, content: m.content })),
          current_page: panelContext.page,
          current_modal: panelContext.modal,
          user_role: user?.role_codes?.[0] || 'student',
          user_name: user?.real_name || '',
          user_lang: userLang,
          refs: refsSnapshot.length > 0 ? refsSnapshot : undefined,
        }),
      });
      if (!res.ok) throw new Error('AI 服务请求失败');
      const data = await res.json();
      setConversationId(data.conversation_id);

      // Fan out highlight signals so right-panel rows can pulse.
      if (Array.isArray(data.highlights) && data.highlights.length > 0) {
        const hlItems = data.highlights
          .filter((h: unknown): h is { type: string; id: string | number } =>
            !!h && typeof h === 'object' && 'type' in h && 'id' in h)
          .map((h: { type: string; id: string | number }) => ({ type: h.type, id: String(h.id) }));
        // If the reply is about a student but we're not on /student, jump there
        // so the table is actually mounted when the pulse fires.
        const needsStudentPage = hlItems.some((h: { type: string }) => h.type === 'student');
        if (needsStudentPage && panelContext.page !== 'student') {
          navigate('/student');
        }
        emitHighlight(hlItems);
      }

      // Build the AI response message
      if (data.action && data.action.type === 'open_leave_form') {
        // Show action card for leave form
        const d = data.action.data || {};
        const card: CardMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          kind: 'action_card',
          content: data.reply,
          card: {
            type: 'leave_prefill',
            fields: [
              { label: '假别', value: LEAVE_TYPE_LABELS[d.leave_type] || d.leave_type || '待选择' },
              { label: '日期', value: d.start_date ? `${d.start_date}${d.end_date && d.end_date !== d.start_date ? ' ~ ' + d.end_date : ''}` : '待选择' },
              { label: '事由', value: d.reason || '待填写' },
              ...(d.reason_category
                ? [{ label: '事由分类', value: String(d.reason_category) }]
                : []),
            ],
          },
        };
        setMessages((prev) => [...prev, card]);

        // Navigate + open form
        navigate('/leave');
        setTimeout(() => dispatchAction('open_leave_form', d), 100);
      } else {
        const aiMsg: TextMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          kind: 'text',
          content: data.reply,
          citations: data.citations ?? undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);

        // Handle non-card actions
        if (data.action) {
          const { type, data: actionData } = data.action;
          if (type === 'navigate') {
            // notification-center 是「通知管理」配置页 — 实际路由是 /system?tab=notif,
            // 跟其他 enum(同名 URL)的简单拼接处理不一样,在这里做特例映射。
            const page = String(actionData.page);
            // tab/focus 可选,LLM 在「看 X 假别配置」场景下会带上,前端拼成 query string
            const params = new URLSearchParams();
            if (actionData.tab) params.set('tab', String(actionData.tab));
            if (actionData.focus) params.set('focus', String(actionData.focus));
            const qs = params.toString() ? `?${params.toString()}` : '';
            if (page === 'notification-center') {
              navigate(`/system?tab=notif${qs ? `&${params.toString()}` : ''}`);
            } else {
              navigate(`/${page}${qs}`);
            }
          } else if (type === 'filter_students') {
            // Filter intent on the student page. Navigate there if the user
            // isn't already, then dispatch so the page applies the filters.
            if (!location.pathname.startsWith('/student')) navigate('/student');
            setTimeout(() => dispatchAction(type, actionData), 100);
          } else if (type === 'propose_notification_config_change') {
            // 校管理员改通知中心规则 — 调 sidecar /notification-config/propose 算 op,
            // 落成 notification_proposal 卡片让老师确认。
            // 同时导航到「通知」配置页方便看 diff 后的现状。
            if (!location.pathname.startsWith('/system')) {
              navigate('/system?tab=notif');
            }
            void runNotificationProposal(String(actionData.instruction || msgText));
          } else if (type === 'propose_workflow_config_change') {
            // 校管理员改请假/销假规则 — 调 sidecar /propose 计算 new_yaml,
            // 落成 workflow_proposal 卡片让老师确认。
            // 同时导航到「请销假配置」页让老师在上下文中看到当前规则,
            // 应用后页面自动 invalidate 刷新。biz_type 通过 URL tab 参数传给页面。
            // /leave-config 已合并到 /leave?tab=...,biz_type 映射:leave→rule,leave_return→return
            const tab = String(actionData.biz_type) === 'leave_return' ? 'return' : 'rule';
            if (location.pathname !== '/leave') {
              navigate(`/leave?tab=${tab}`);
            }
            void runWorkflowProposal(
              String(actionData.biz_type),
              actionData.college_id != null ? Number(actionData.college_id) : null,
              String(actionData.instruction || msgText),
            );
          } else {
            if (type === 'open_checkin_form') navigate('/checkin');
            else if (type === 'open_collection_form') navigate('/collection');
            else if (type === 'open_violation_form') navigate('/violation');
            setTimeout(() => dispatchAction(type, actionData), 100);
          }
        }
      }
    } catch (e) {
      // 把具体错误带出来,定位「连接失败」是 timeout / 500 / parse 还是 reload 撞窗口。
      const detail = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          kind: 'text' as const,
          content: `AI 服务连接失败:${detail}。请稍后重试。`,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Render message ── */

  const renderMessage = (msg: Message) => {
    if (msg.kind === 'event') {
      return (
        <div key={msg.id} className={styles.eventMsg}>
          <CheckCircleOutlined className={styles.eventIcon} />
          <span>{msg.content}</span>
        </div>
      );
    }

    if (msg.kind === 'workflow_proposal') {
      const m = msg;
      const titleByBiz: Record<string, string> = {
        leave: '请假规则改动',
        leave_return: '销假规则改动',
      };
      return (
        <div key={m.id} className={`${styles.msg} ${styles.assistant}`}>
          <div className={styles.msgBubble}>
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.ai_message || ''}</ReactMarkdown>
            </div>
          </div>
          <div className={styles.actionCard} style={{ borderColor: '#a78bfa' }}>
            <div className={styles.cardTitle}>
              <ToolOutlined className={styles.cardTitleIcon} />
              <span>{titleByBiz[m.biz_type] || '配置改动'}</span>
              <span className={styles.cardTitleDot} />
            </div>
            <div style={{ padding: '8px 12px 4px', fontSize: 12, color: 'var(--fg-3)' }}>
              老师指令:{m.instruction}
            </div>
            <div style={{ padding: '4px 12px 12px', fontSize: 13, lineHeight: 1.7 }}>
              <div className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.diff_zh}</ReactMarkdown>
              </div>
            </div>
            {m.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
                <button
                  className={styles.confirmBtn ?? ''}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: 'none',
                    borderRadius: 6,
                    background: '#1677ff',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => applyWorkflowProposal(m.id)}
                >
                  确认应用
                </button>
                <button
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--bd-2, #e5e7eb)',
                    borderRadius: 6,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => cancelWorkflowProposal(m.id)}
                >
                  取消
                </button>
              </div>
            )}
            {m.status === 'applying' && (
              <div style={{ padding: '0 12px 12px', fontSize: 12, color: 'var(--fg-3)' }}>
                正在应用…
              </div>
            )}
            {m.status === 'applied' && (
              <div style={{
                padding: '8px 12px',
                margin: '0 12px 12px',
                background: '#f0fdf4',
                color: '#166534',
                borderRadius: 6,
                fontSize: 13,
              }}>
                ✅ 已应用,请销假配置页已自动刷新到新版本。
              </div>
            )}
            {m.status === 'cancelled' && (
              <div style={{ padding: '0 12px 12px', fontSize: 12, color: 'var(--fg-3)' }}>
                已取消,未应用任何改动。
              </div>
            )}
            {m.status === 'failed' && (
              <div style={{
                padding: '8px 12px',
                margin: '0 12px 12px',
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: 6,
                fontSize: 13,
              }}>
                ❌ 应用失败:{m.error}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (msg.kind === 'notification_proposal') {
      const m = msg;
      return (
        <div key={m.id} className={`${styles.msg} ${styles.assistant}`}>
          <div className={styles.msgBubble}>
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.ai_message || ''}</ReactMarkdown>
            </div>
          </div>
          <div className={styles.actionCard} style={{ borderColor: '#a78bfa' }}>
            <div className={styles.cardTitle}>
              <ToolOutlined className={styles.cardTitleIcon} />
              <span>通知规则改动</span>
              <span className={styles.cardTitleDot} />
            </div>
            <div style={{ padding: '8px 12px 4px', fontSize: 12, color: 'var(--fg-3)' }}>
              老师指令:{m.instruction}
            </div>
            <div style={{ padding: '4px 12px 12px', fontSize: 13, lineHeight: 1.7 }}>
              <div className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.diff_zh}</ReactMarkdown>
              </div>
            </div>
            {m.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
                <button
                  className={styles.confirmBtn ?? ''}
                  style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => applyNotificationProposal(m.id)}
                >
                  确认应用
                </button>
                <button
                  style={{ padding: '8px 16px', border: '1px solid var(--bd-2, #e5e7eb)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                  onClick={() => cancelNotificationProposal(m.id)}
                >
                  取消
                </button>
              </div>
            )}
            {m.status === 'applying' && (
              <div style={{ padding: '0 12px 12px', fontSize: 12, color: 'var(--fg-3)' }}>正在应用…</div>
            )}
            {m.status === 'applied' && (
              <div style={{ padding: '8px 12px', margin: '0 12px 12px', background: '#f0fdf4', color: '#166534', borderRadius: 6, fontSize: 13 }}>
                已应用,通知中心已自动刷新。
              </div>
            )}
            {m.status === 'cancelled' && (
              <div style={{ padding: '0 12px 12px', fontSize: 12, color: 'var(--fg-3)' }}>已取消,未应用任何改动。</div>
            )}
            {m.status === 'failed' && (
              <div style={{ padding: '8px 12px', margin: '0 12px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>
                应用失败:{m.error}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (msg.kind === 'action_card') {
      return (
        <div key={msg.id} className={`${styles.msg} ${styles.assistant}`}>
          <div className={styles.msgBubble}>
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          </div>
          <div className={styles.actionCard}>
            <div className={styles.cardTitle}>
              <FormOutlined className={styles.cardTitleIcon} />
              <span>{msg.card.type === 'leave_prefill' ? '请假申请' : '操作确认'}</span>
              <span className={styles.cardTitleDot} />
            </div>
            <div className={styles.cardFields}>
              {msg.card.fields.map((f) => (
                <div key={f.label} className={styles.cardField}>
                  <span className={styles.cardLabel}>{f.label}</span>
                  <span className={styles.cardValue}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Text message
    const isAssistant = msg.role === 'assistant';
    return (
      <div key={msg.id} className={`${styles.msg} ${styles[msg.role]}`}>
        <div className={styles.msgBubble}>
          {isAssistant ? (
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            msg.content
          )}
        </div>
        {msg.citations && msg.citations.length > 0 && (
          <div className={styles.citations}>
            <BookOutlined className={styles.citationsIcon} />
            <span className={styles.citationsLabel}>参考</span>
            {msg.citations.map((c) => (
              <span key={c.doc_id} className={styles.citationTag}>《{c.title}》</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ── Context pill ── */

  // /workspace label flips to 校园 for students (their page is a school-life
  // dashboard, not a "workspace"). Other roles keep 工作台.
  const currentPageLabel = panelContext.page === 'workspace' && isStudent
    ? '校园'
    : PAGE_LABELS[panelContext.page] || panelContext.page;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <AssistantAvatar />
          <div className={styles.headerGlow} />
        </div>
        <div className={styles.headerText}>
          <div className={styles.headerTitle}>
            {persona.name}
            <span className={styles.headerVersion}>v0.1</span>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.statusDot} />
            在线
          </div>
        </div>
        {/* Reset chat → empty state grid (the "快捷问答" view). Pinned refs
            are intentionally kept — they live independently and have their
            own clear button down by the input. */}
        {messages.length > 0 && (
          <button
            type="button"
            className={styles.headerNewBtn}
            title="新对话（清空当前会话，回到快捷入口）"
            onClick={() => setMessages([])}
          >
            <PlusOutlined />
            <span>新对话</span>
          </button>
        )}
      </div>

      {/* Context bar */}
      <div className={styles.contextBar}>
        <span className={styles.contextDot} />
        <span>当前页面：{currentPageLabel}</span>
      </div>

      {/* Messages area */}
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <AssistantAvatar />
              <div className={styles.emptyIconGlow} />
            </div>
            <p className={styles.emptyTitle}>我是{persona.name}，能帮您做什么？</p>
            <p className={styles.emptyHint}>朝夕的 AI 助手，可以快速操作系统功能，也是您的校规政策知识问答入口</p>

            <div className={styles.quickGroup}>
              <span className={styles.quickGroupLabel}>快捷操作</span>
              <div className={styles.quickGrid}>
                {isStudent ? (
                  <>
                    {/* Leave-apply card: tap header for the generic "I want to take
                        leave" path (Xiaoxi will then ask the type / time / etc.); tap
                        a type chip to skip straight to that flavor. Fixes the old
                        "请明天一天事假" hardcode that always assumed personal leave. */}
                    <div className={styles.quickCard}>
                      <button
                        type="button"
                        className={styles.quickCardHeader}
                        onClick={() => handleSend('我想请假')}
                      >
                        <span className={`${styles.quickIconWrap} ${styles.accent}`}><CalendarOutlined /></span>
                        <span className={styles.quickTextGroup}>
                          <span className={styles.quickText}>请假申请</span>
                          <span className={styles.quickDesc}>选假别直接开始，或让{persona.name}引导</span>
                        </span>
                        <RightOutlined className={styles.quickArrow} />
                      </button>
                      <div className={styles.quickChips}>
                        <button type="button" className={styles.chip} onClick={() => handleSend('我想请事假')}>事假</button>
                        <button type="button" className={styles.chip} onClick={() => handleSend('我想请病假')}>病假</button>
                        <button type="button" className={styles.chip} onClick={() => handleSend('我想请公假')}>公假</button>
                        <button type="button" className={styles.chip} onClick={() => handleSend('我想申请周末离校')}>周末离校</button>
                      </div>
                    </div>
                    <button className={styles.quickBtn} onClick={() => handleSend('学生请假最多能请几天？')}>
                      <span className={`${styles.quickIconWrap} ${styles.cyan}`}><QuestionCircleOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>请假规定</span>
                        <span className={styles.quickDesc}>假期天数与审批流程</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
                    <button className={styles.quickBtn} onClick={() => handleSend('我有什么未读通知？')}>
                      <span className={`${styles.quickIconWrap} ${styles.amber}`}><CompassOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>通知查看</span>
                        <span className={styles.quickDesc}>查看未读通知</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className={styles.quickBtn} onClick={() => handleSend('有哪些待审批的请假？')}>
                      <span className={`${styles.quickIconWrap} ${styles.accent}`}><CheckCircleOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>审批待办</span>
                        <span className={styles.quickDesc}>查看待审批请假</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
                    <button className={styles.quickBtn} onClick={() => handleSend('帮我创建一个签到活动')}>
                      <span className={`${styles.quickIconWrap} ${styles.cyan}`}><CheckSquareOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>发起签到</span>
                        <span className={styles.quickDesc}>创建签到活动</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
                    <button className={styles.quickBtn} onClick={() => handleSend('帮我创建一个信息收集')}>
                      <span className={`${styles.quickIconWrap} ${styles.green}`}><FileTextOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>信息收集</span>
                        <span className={styles.quickDesc}>发起收集任务</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className={styles.quickGroup}>
              <span className={styles.quickGroupLabel}>知识问答</span>
              <div className={styles.quickGrid}>
                <button className={styles.quickBtn} onClick={() => handleSend('学生请假最多能请几天？')}>
                  <span className={`${styles.quickIconWrap} ${styles.accent}`}><QuestionCircleOutlined /></span>
                  <span className={styles.quickTextGroup}>
                    <span className={styles.quickText}>请假规定</span>
                    <span className={styles.quickDesc}>假期天数与审批流程</span>
                  </span>
                  <RightOutlined className={styles.quickArrow} />
                </button>
                <button className={styles.quickBtn} onClick={() => handleSend('晚归未归怎么处理？')}>
                  <span className={`${styles.quickIconWrap} ${styles.cyan}`}><BulbOutlined /></span>
                  <span className={styles.quickTextGroup}>
                    <span className={styles.quickText}>考勤处理</span>
                    <span className={styles.quickDesc}>晚归未归处理流程</span>
                  </span>
                  <RightOutlined className={styles.quickArrow} />
                </button>
                <button className={styles.quickBtn} onClick={() => handleSend('奖学金申请条件是什么？')}>
                  <span className={`${styles.quickIconWrap} ${styles.green}`}><BulbOutlined /></span>
                  <span className={styles.quickTextGroup}>
                    <span className={styles.quickText}>奖学金政策</span>
                    <span className={styles.quickDesc}>申请条件与评选流程</span>
                  </span>
                  <RightOutlined className={styles.quickArrow} />
                </button>
                <button className={styles.quickBtn} onClick={() => handleSend('学生违纪处分有哪些等级？')}>
                  <span className={`${styles.quickIconWrap} ${styles.amber}`}><QuestionCircleOutlined /></span>
                  <span className={styles.quickTextGroup}>
                    <span className={styles.quickText}>校规制度</span>
                    <span className={styles.quickDesc}>违纪处分与申诉流程</span>
                  </span>
                  <RightOutlined className={styles.quickArrow} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        {loading && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            <div className={`${styles.msgBubble} ${styles.thinking}`}>
              <span className={styles.thinkingText}>正在思考</span>
              <span className={styles.thinkingDots}>
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips: route-actions (direct nav, permission-gated) + AI Q&A */}
      {messages.length > 0 && !loading && (
        <div className={styles.suggestions}>
          {QUICK_ROUTES.filter(
            (r) => r.permission === null || hasPermission(r.permission),
          ).map((r) => (
            <button
              key={r.path}
              className={`${styles.suggestion} ${styles.routeSuggestion}`}
              title={`跳转到 ${r.label}`}
              onClick={() => navigate(r.path)}
            >
              {r.label}
            </button>
          ))}
          {(isStudent ? STUDENT_AI_QUESTIONS : STAFF_AI_QUESTIONS).map((q) => (
            <button
              key={q.label}
              className={styles.suggestion}
              onClick={() => handleSend(q.prompt)}
            >
              {q.label}
            </button>
          ))}
          {panelContext.page === 'work-study' &&
            (isStudent ? WORKSTUDY_STUDENT_CHIPS : WORKSTUDY_STAFF_CHIPS).map((q) => {
              const isCandidate = q.prompt === '__USE_PINNED_POSITION__';
              const dynamicPrompt = isCandidate ? candidatePrompt(pinnedRefs) : q.prompt;
              const disabled = isCandidate && dynamicPrompt === null;
              return (
                <button
                  key={q.label}
                  className={styles.suggestion}
                  title={
                    disabled
                      ? '请先在岗位列表/详情里点击"问 AI"或 Pin 一个岗位再用此快捷键'
                      : dynamicPrompt ?? q.prompt
                  }
                  disabled={disabled}
                  style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  onClick={() => dynamicPrompt && handleSend(dynamicPrompt)}
                >
                  🤖 {q.label}
                </button>
              );
            })}
        </div>
      )}

      {/* Pinned refs chips — sticky until explicitly removed */}
      {pinnedRefs.length > 0 && (
        <div className={styles.pinnedRefs}>
          <span className={styles.pinnedLabel}>
            <PushpinOutlined />
            针对
          </span>
          {pinnedRefs.map((r) => (
            <span
              key={`${r.type}:${r.id}`}
              className={styles.pinnedChip}
              title={r.detail ?? r.label}
              onMouseEnter={() => setHoveredRef({ type: r.type, id: r.id })}
              onMouseLeave={() => setHoveredRef(null)}
            >
              <span className={styles.pinnedChipType}>{r.type}</span>
              <span className={styles.pinnedChipLabel}>{r.label}</span>
              <button
                type="button"
                className={styles.pinnedChipRemove}
                onClick={() => unpinRef(r.type, r.id)}
                aria-label="移除"
              >
                <CloseOutlined />
              </button>
            </span>
          ))}
          <button
            type="button"
            className={styles.pinnedClearAll}
            onClick={clearPinnedRefs}
            title="清空所有上下文对象"
          >
            清空
          </button>
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="输入消息..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className={styles.sendBtn}
            disabled={!input.trim() || loading}
            onClick={() => handleSend()}
          >
            <SendOutlined />
          </button>
        </div>
      </div>

      {/* Batch action drawer — overlays the whole panel when active */}
      {batchOpen && (
        <div className={styles.drawerOverlay}>
          <BatchActionDrawer />
        </div>
      )}
    </div>
  );
}
