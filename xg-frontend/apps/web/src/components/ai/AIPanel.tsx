import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  RobotOutlined, SendOutlined, CheckCircleOutlined, EditOutlined, FormOutlined,
  CalendarOutlined, FileTextOutlined, CheckSquareOutlined, QuestionCircleOutlined,
  CompassOutlined, BulbOutlined, RightOutlined, BookOutlined, PushpinOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useBatchActionStore } from '@/stores/batch-action.store';
import { useLocaleStore } from '@/stores/locale.store';
import { useAuth } from '@/hooks/useAuth';
import BatchActionDrawer from '@/components/batch/BatchActionDrawer';
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
    buttons: { label: string; action: string; data?: Record<string, unknown> }[];
    /** Set after the user clicks any button — locks the card so the action
     *  isn't dispatched twice if the user clicks again. */
    consumed?: boolean;
    /** Last action the user took on this card, for the inline status text. */
    lastAction?: string;
  };
}

interface EventMessage {
  id: string;
  role: 'assistant';
  kind: 'event';
  content: string;
  icon: 'success' | 'info';
}

type Message = TextMessage | CardMessage | EventMessage;

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
  checkin: '签到', notification: '通知任务',
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
  const inputRef = useRef<HTMLInputElement>(null);

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
            ],
            buttons: [
              { label: '去修改', action: 'open_form', data: d },
              { label: '直接提交', action: 'submit_leave', data: d },
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
            navigate(`/${actionData.page}`);
          } else if (type === 'filter_students') {
            // Filter intent on the student page. Navigate there if the user
            // isn't already, then dispatch so the page applies the filters.
            if (!location.pathname.startsWith('/student')) navigate('/student');
            setTimeout(() => dispatchAction(type, actionData), 100);
          } else {
            if (type === 'open_checkin_form') navigate('/checkin');
            else if (type === 'open_collection_form') navigate('/collection');
            else if (type === 'open_violation_form') navigate('/violation');
            setTimeout(() => dispatchAction(type, actionData), 100);
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', kind: 'text' as const, content: 'AI 服务连接失败，请稍后重试。' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleCardButton = (msgId: string, action: string, data?: Record<string, unknown>) => {
    // Lock the card immediately so a double-click doesn't fire the action twice
    // (especially "直接提交" which would create duplicate leave_request rows).
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === 'action_card'
          ? { ...m, card: { ...m.card, consumed: true, lastAction: action } }
          : m,
      ),
    );
    if (action === 'open_form') {
      navigate('/leave');
      setTimeout(() => dispatchAction('open_leave_form', data), 100);
    } else if (action === 'submit_leave') {
      dispatchAction('submit_leave_directly', data);
      navigate('/leave');
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
            <div className={styles.cardButtons}>
              {msg.card.consumed ? (
                <span style={{
                  fontSize: 12, color: 'var(--fg-3)',
                  background: 'var(--bg-3)', padding: '4px 10px',
                  borderRadius: 4,
                }}>
                  {msg.card.lastAction === 'submit_leave'
                    ? '✓ 已提交申请'
                    : msg.card.lastAction === 'open_form'
                      ? '✓ 已打开表单（请在右侧继续）'
                      : '✓ 已处理'}
                </span>
              ) : (
                msg.card.buttons.map((btn) => (
                <button
                  key={btn.action}
                  className={`${styles.cardBtn} ${btn.action === 'submit_leave' ? styles.cardBtnPrimary : ''}`}
                  onClick={() => handleCardButton(msg.id, btn.action, btn.data)}
                >
                  {btn.action === 'open_form' ? <EditOutlined /> : <FormOutlined />}
                  {btn.label}
                </button>
                ))
              )}
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

  const currentPageLabel = PAGE_LABELS[panelContext.page] || panelContext.page;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <RobotOutlined />
          <div className={styles.headerGlow} />
        </div>
        <div className={styles.headerText}>
          <div className={styles.headerTitle}>
            AI 助手
            <span className={styles.headerVersion}>v0.1</span>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.statusDot} />
            在线
          </div>
        </div>
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
              <RobotOutlined />
              <div className={styles.emptyIconGlow} />
            </div>
            <p className={styles.emptyTitle}>有什么可以帮您？</p>
            <p className={styles.emptyHint}>我是您的智能助手，可以快速操作系统功能，也是您的校规政策知识问答入口</p>

            <div className={styles.quickGroup}>
              <span className={styles.quickGroupLabel}>快捷操作</span>
              <div className={styles.quickGrid}>
                {isStudent ? (
                  <>
                    <button className={styles.quickBtn} onClick={() => handleSend('帮我请明天一天事假')}>
                      <span className={`${styles.quickIconWrap} ${styles.accent}`}><CalendarOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>请假申请</span>
                        <span className={styles.quickDesc}>AI 引导填写，快速提交</span>
                      </span>
                      <RightOutlined className={styles.quickArrow} />
                    </button>
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
                    <button className={styles.quickBtn} onClick={() => handleSend('帮我发一条通知')}>
                      <span className={`${styles.quickIconWrap} ${styles.amber}`}><CompassOutlined /></span>
                      <span className={styles.quickTextGroup}>
                        <span className={styles.quickText}>发通知</span>
                        <span className={styles.quickDesc}>发布通知任务</span>
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
