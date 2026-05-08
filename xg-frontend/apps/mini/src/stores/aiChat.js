"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAIChatStore = void 0;
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
const taro_1 = __importDefault(require("@tarojs/taro"));
const zustand_1 = require("zustand");
const request_1 = require("../utils/request");
/** 当前页用作 sidecar prompt 的 current_page hint。 */
function currentPageHint() {
    var _a;
    try {
        const pages = taro_1.default.getCurrentPages();
        const top = pages[pages.length - 1];
        const route = (_a = top === null || top === void 0 ? void 0 : top.route) !== null && _a !== void 0 ? _a : '';
        // pages/leave/list/index → leave；pages/home/index → workspace
        if (route.startsWith('pages/leave/'))
            return 'leave';
        if (route.startsWith('pages/notifications/'))
            return 'notification';
        if (route.startsWith('pages/myWorkStudy') || route.startsWith('pages/workStudy'))
            return 'work-study';
        if (route.startsWith('pages/schedule/'))
            return 'schedule';
        if (route.startsWith('pages/profile/'))
            return 'profile';
        return 'workspace';
    }
    catch (_b) {
        return 'workspace';
    }
}
/** 处理 sidecar 返回的 action。返回是否需要追加 reply 文本到消息列表。 */
function dispatchAction(action, _reply) {
    const { type, data } = action;
    switch (type) {
        case 'open_leave_form': {
            // 把预填字段塞进 storage，apply 页 onLoad 时读 + 清
            taro_1.default.setStorageSync('_leave_apply_prefill', data !== null && data !== void 0 ? data : {});
            taro_1.default.navigateTo({ url: '/pages/leave/apply/index' });
            break;
        }
        case 'navigate': {
            const page = data === null || data === void 0 ? void 0 : data.page;
            if (!page)
                return;
            // mini 端能处理的页面映射（与 dispatchAction 类型对齐 web）
            const map = {
                leave: '/pages/leave/list/index',
                'work-study': '/pages/myWorkStudy/index',
                notification: '/pages/notifications/index',
                workspace: '/pages/home/index',
                schedule: '/pages/schedule/index',
            };
            const url = map[page];
            if (!url)
                return;
            // workspace / 已注册 tab 用 switchTab，否则 navigateTo
            if (url.includes('/home/') || url.includes('/apps/') || url.includes('/profile/')) {
                taro_1.default.switchTab({ url }).catch(() => taro_1.default.navigateTo({ url }));
            }
            else {
                taro_1.default.navigateTo({ url }).catch(() => undefined);
            }
            break;
        }
        default:
            // 其它 action（filter_students / open_checkin_form 等）mini 暂未实现对应页，
            // 静默忽略——LLM 的 reply 文本仍会展示，用户可用其它入口手动操作
            break;
    }
}
exports.useAIChatStore = (0, zustand_1.create)((set, get) => ({
    isOpen: false,
    messages: [],
    conversationId: null,
    loading: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    newConversation: () => set({ messages: [], conversationId: null }),
    pushAssistantText: (text) => set((s) => ({ messages: [...s.messages, { role: 'assistant', kind: 'text', text }] })),
    send: async (text) => {
        var _a;
        const trimmed = text.trim();
        const state = get();
        if (!trimmed || state.loading)
            return;
        // 入栈用户消息 + 切换 loading
        const user = taro_1.default.getStorageSync('user');
        const history = state.messages
            .filter((m) => m.kind === 'text')
            .map((m) => ({ role: m.role, content: m.text }));
        set({
            isOpen: true,
            loading: true,
            messages: [...state.messages, { role: 'user', kind: 'text', text: trimmed }],
        });
        try {
            const res = await (0, request_1.postAi)('/chat', {
                message: trimmed,
                conversation_id: state.conversationId,
                history,
                current_page: currentPageHint(),
                user_role: ((_a = user === null || user === void 0 ? void 0 : user.roleCodes) === null || _a === void 0 ? void 0 : _a[0]) || 'student',
                user_name: user === null || user === void 0 ? void 0 : user.realName,
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
        }
        catch (e) {
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
//# sourceMappingURL=aiChat.js.map