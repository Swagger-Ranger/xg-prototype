/* AI 助手全局状态 + 发送逻辑。
 *
 * 与 web `AIPanel.tsx` 对齐的核心能力：
 *   · 发送时附带 history（已有 text 消息）+ current_page + user_role / user_name
 *   · 处理 sidecar 返回的 action：navigate / open_leave_form / 等
 *   · loading 状态在 store 暴露，UI 各处共用（dock 输入框 + drawer "正在思考" bubble）
 *   · "新对话"清空 messages + conversationId，回到空态 quick action 视图
 *
 * 抽屉跨 tab 切换不丢对话历史，store 是单例。
 */
import Taro from '@tarojs/taro';
import { create } from 'zustand';
import { postAi } from '../utils/request';

export type MsgKind = 'text' | 'event';

export interface AIMsg {
  role: 'user' | 'assistant';
  kind: MsgKind;
  text: string;
}

interface ActionPayload {
  type: string;
  data?: Record<string, unknown> | null;
}

interface ChatResponse {
  reply: string;
  conversation_id: string;
  action?: ActionPayload | null;
  citations?: unknown[] | null;
  highlights?: unknown[] | null;
}

interface AIChatState {
  isOpen: boolean;
  messages: AIMsg[];
  conversationId: string | null;
  loading: boolean;

  open: () => void;
  close: () => void;
  toggle: () => void;
  newConversation: () => void;
  pushAssistantText: (text: string) => void;

  /** 发送消息。空态 quick action 与 dock 输入都走这里。 */
  send: (text: string) => Promise<void>;
}

/** 当前页用作 sidecar prompt 的 current_page hint。 */
function currentPageHint(): string {
  try {
    const pages = Taro.getCurrentPages();
    const top = pages[pages.length - 1];
    const route = top?.route ?? '';
    // pages/leave/list/index → leave；pages/home/index → workspace
    if (route.startsWith('pages/leave/')) return 'leave';
    if (route.startsWith('pages/notifications/')) return 'notification';
    if (route.startsWith('pages/myWorkStudy') || route.startsWith('pages/workStudy')) return 'work-study';
    if (route.startsWith('pages/schedule/')) return 'schedule';
    if (route.startsWith('pages/profile/')) return 'profile';
    return 'workspace';
  } catch {
    return 'workspace';
  }
}

/** 处理 sidecar 返回的 action。返回是否需要追加 reply 文本到消息列表。 */
function dispatchAction(action: ActionPayload, _reply: string): void {
  const { type, data } = action;
  switch (type) {
    case 'open_leave_form': {
      // 把预填字段塞进 storage，apply 页 onLoad 时读 + 清
      Taro.setStorageSync('_leave_apply_prefill', data ?? {});
      Taro.navigateTo({ url: '/pages/leave/apply/index' });
      break;
    }
    case 'navigate': {
      const page = (data as { page?: string } | null)?.page;
      if (!page) return;
      // mini 端能处理的页面映射（与 dispatchAction 类型对齐 web）
      const map: Record<string, string> = {
        leave: '/pages/leave/list/index',
        'work-study': '/pages/myWorkStudy/index',
        notification: '/pages/notifications/index',
        workspace: '/pages/home/index',
        schedule: '/pages/schedule/index',
      };
      const url = map[page];
      if (!url) return;
      // workspace / 已注册 tab 用 switchTab，否则 navigateTo
      if (url.includes('/home/') || url.includes('/apps/') || url.includes('/profile/')) {
        Taro.switchTab({ url }).catch(() => Taro.navigateTo({ url }));
      } else {
        Taro.navigateTo({ url }).catch(() => undefined);
      }
      break;
    }
    default:
      // 其它 action（filter_students / open_checkin_form 等）mini 暂未实现对应页，
      // 静默忽略——LLM 的 reply 文本仍会展示，用户可用其它入口手动操作
      break;
  }
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  isOpen: false,
  messages: [],
  conversationId: null,
  loading: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  newConversation: () => set({ messages: [], conversationId: null }),
  pushAssistantText: (text) =>
    set((s) => ({ messages: [...s.messages, { role: 'assistant', kind: 'text', text }] })),

  send: async (text: string) => {
    const trimmed = text.trim();
    const state = get();
    if (!trimmed || state.loading) return;

    // 入栈用户消息 + 切换 loading
    const user = Taro.getStorageSync('user') as
      | { roleCodes?: string[]; realName?: string }
      | undefined;
    const history = state.messages
      .filter((m) => m.kind === 'text')
      .map((m) => ({ role: m.role, content: m.text }));

    set({
      isOpen: true,
      loading: true,
      messages: [...state.messages, { role: 'user', kind: 'text', text: trimmed }],
    });

    try {
      const res = await postAi<ChatResponse>('/chat', {
        message: trimmed,
        conversation_id: state.conversationId,
        history,
        current_page: currentPageHint(),
        user_role: user?.roleCodes?.[0] || 'student',
        user_name: user?.realName,
      });

      set((s) => ({
        conversationId: res.conversation_id,
        messages: [...s.messages, { role: 'assistant', kind: 'text', text: res.reply }],
        loading: false,
      }));

      // 派发 action（在 reply 之后，确保用户先看到 LLM 文字解释）
      if (res.action && res.action.type) {
        dispatchAction(res.action, res.reply);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 调用失败';
      set((s) => ({
        messages: [
          ...s.messages,
          { role: 'assistant', kind: 'text', text: `[失败] ${msg}` },
        ],
        loading: false,
      }));
    }
  },
}));
