import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  RobotOutlined, SendOutlined, CheckCircleOutlined, EditOutlined, FormOutlined,
  CalendarOutlined, FileTextOutlined, CheckSquareOutlined, QuestionCircleOutlined,
  CompassOutlined, BulbOutlined, RightOutlined, BookOutlined,
} from '@ant-design/icons';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useAuth } from '@/hooks/useAuth';
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
  checkin: '签到', notification: '通知任务', complaint: '接诉即办',
  student: '学生信息',
};

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

  const { user, isStudent } = useAuth();

  const dispatchAction = useAIActionStore((s) => s.dispatch);
  const panelContext = useAIActionStore((s) => s.panelContext);
  const setContext = useAIActionStore((s) => s.setContext);
  const panelEvent = useAIActionStore((s) => s.panelEvent);
  const consumeEvent = useAIActionStore((s) => s.consumeEvent);

  // Track current page from URL
  useEffect(() => {
    const page = location.pathname.split('/')[1] || 'workspace';
    setContext({ page });
  }, [location.pathname, setContext]);

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

    const userMsg: TextMessage = { id: Date.now().toString(), role: 'user', kind: 'text', content: msgText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setTimeout(scrollToBottom, 50);

    try {
      const token = localStorage.getItem('xg_token');
      const tenantId = user?.tenant_id || 'default';
      const userId = user?.id ? String(user.id) : '';
      const res = await fetch('/ai/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'X-User-Id': userId,
          'X-Tenant-Id': tenantId,
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
        }),
      });
      if (!res.ok) throw new Error('AI 服务请求失败');
      const data = await res.json();
      setConversationId(data.conversation_id);

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
          } else {
            if (type === 'open_checkin_form') navigate('/checkin');
            else if (type === 'open_collection_form') navigate('/collection');
            else if (type === 'open_complaint_form') navigate('/complaint');
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

  const handleCardButton = (action: string, data?: Record<string, unknown>) => {
    if (action === 'open_form') {
      navigate('/leave');
      setTimeout(() => dispatchAction('open_leave_form', data), 100);
    } else if (action === 'submit_leave') {
      // Directly submit via AI
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
              {msg.card.buttons.map((btn) => (
                <button
                  key={btn.action}
                  className={`${styles.cardBtn} ${btn.action === 'submit_leave' ? styles.cardBtnPrimary : ''}`}
                  onClick={() => handleCardButton(btn.action, btn.data)}
                >
                  {btn.action === 'open_form' ? <EditOutlined /> : <FormOutlined />}
                  {btn.label}
                </button>
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

      {/* Suggestion chips */}
      {messages.length > 0 && !loading && (
        <div className={styles.suggestions}>
          {isStudent ? (
            <>
              <button className={styles.suggestion} onClick={() => handleSend('帮我请假')}>请假</button>
              <button className={styles.suggestion} onClick={() => handleSend('帮我销假')}>销假</button>
              <button className={styles.suggestion} onClick={() => handleSend('我有什么未读通知？')}>通知</button>
              <button className={styles.suggestion} onClick={() => handleSend('奖学金申请条件是什么？')}>奖学金</button>
              <button className={styles.suggestion} onClick={() => handleSend('学生请假最多能请几天？')}>校规问答</button>
            </>
          ) : (
            <>
              <button className={styles.suggestion} onClick={() => handleSend('有哪些待审批的请假？')}>审批</button>
              <button className={styles.suggestion} onClick={() => handleSend('帮我创建一个签到活动')}>签到</button>
              <button className={styles.suggestion} onClick={() => handleSend('帮我创建一个信息收集')}>收集</button>
              <button className={styles.suggestion} onClick={() => handleSend('帮我发一条通知')}>通知</button>
              <button className={styles.suggestion} onClick={() => handleSend('请假规定是什么？')}>校规问答</button>
            </>
          )}
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
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
    </div>
  );
}
