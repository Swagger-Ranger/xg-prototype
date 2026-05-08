"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AIChatDrawer;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../utils/icons");
const aiChat_1 = require("../stores/aiChat");
const AIChatDrawer_module_css_1 = __importDefault(require("./AIChatDrawer.module.css"));
const STUDENT_ACTIONS = [
    { label: '请假申请', desc: 'AI 引导填写，快速提交', icon: 'edit', prompt: '帮我请明天一天事假' },
    { label: '我的请假', desc: '查看进度与历史', icon: 'file-text', prompt: '我的请假最近怎么样？' },
    { label: '查通知', desc: '查看未读通知', icon: 'bell', prompt: '我有什么未读通知？' },
];
const STAFF_ACTIONS = [
    { label: '审批待办', desc: '查看待审批请假', icon: 'check', prompt: '有哪些待审批的请假？' },
    { label: '班级动态', desc: '看本班今日离校', icon: 'file-text', prompt: '今天班里有谁请假？' },
    { label: '风险预警', desc: '看需关注学生', icon: 'alert-triangle', prompt: '现在有几位学生处于预警状态？' },
];
const KB_QUESTIONS_STUDENT = [
    { label: '请假规定', desc: '假期天数与审批流程', icon: 'file-text', prompt: '学生请假最多能请几天？' },
    { label: '奖学金政策', desc: '申请条件与评选', icon: 'sparkles', prompt: '奖学金申请条件是什么？' },
];
const KB_QUESTIONS_STAFF = [
    { label: '请假规定', desc: '假期天数与审批流程', icon: 'file-text', prompt: '请假规定是什么？' },
    { label: '违纪处分', desc: '处分等级与申诉', icon: 'alert-triangle', prompt: '学生违纪处分有哪些等级？' },
];
const STAFF_ROLES = ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'];
function isStaff(user) {
    var _a;
    return ((_a = user === null || user === void 0 ? void 0 : user.roleCodes) !== null && _a !== void 0 ? _a : []).some((r) => STAFF_ROLES.includes(r));
}
function AIChatDrawer() {
    const isOpen = (0, aiChat_1.useAIChatStore)((s) => s.isOpen);
    const messages = (0, aiChat_1.useAIChatStore)((s) => s.messages);
    const loading = (0, aiChat_1.useAIChatStore)((s) => s.loading);
    const close = (0, aiChat_1.useAIChatStore)((s) => s.close);
    const newConversation = (0, aiChat_1.useAIChatStore)((s) => s.newConversation);
    const send = (0, aiChat_1.useAIChatStore)((s) => s.send);
    const [user, setUser] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            const raw = taro_1.default.getStorageSync('user');
            setUser(raw !== null && raw !== void 0 ? raw : null);
        }
    }, [isOpen]);
    const staff = isStaff(user !== null && user !== void 0 ? user : undefined);
    const quickActions = staff ? STAFF_ACTIONS : STUDENT_ACTIONS;
    const kbActions = staff ? KB_QUESTIONS_STAFF : KB_QUESTIONS_STUDENT;
    const onQuickTap = (a) => {
        void send(a.prompt);
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${AIChatDrawer_module_css_1.default.backdrop} ${isOpen ? AIChatDrawer_module_css_1.default.backdropOpen : ''}`, onClick: close }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${AIChatDrawer_module_css_1.default.sheet} ${isOpen ? AIChatDrawer_module_css_1.default.sheetOpen : ''}`, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.header, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerIcon, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "sparkles", color: "#fff", weight: 2, size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerInfo, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerTitleRow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.headerTitle, children: "AI \u52A9\u624B" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerStatus, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerStatusDot }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.headerStatusText, children: "\u5728\u7EBF" })] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.headerHint, children: messages.length > 0 ? `${messages.length} 条对话` : '问任意校内事务' })] }), messages.length > 0 && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.headerActionBtn, onClick: () => newConversation(), children: [(0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "sparkles", color: "#3a6df0", weight: 2, size: 22 }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.headerActionLabel, children: "\u65B0\u5BF9\u8BDD" })] })), (0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.closeBtn, onClick: close, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "x", color: "#64748b", weight: 2, size: 32 }) })] }), (0, jsx_runtime_1.jsx)(components_1.ScrollView, { className: AIChatDrawer_module_css_1.default.messages, scrollY: true, scrollIntoView: messages.length > 0 ? `m${messages.length - 1}` : undefined, children: messages.length === 0 ? ((0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.empty, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.emptyTitle, children: "\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u60A8\uFF1F" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.emptyHint, children: "\u671D\u5915\u7684 AI \u52A9\u624B\uFF0C\u53EF\u4EE5\u5FEB\u901F\u64CD\u4F5C\u7CFB\u7EDF\u529F\u80FD\uFF0C\u4E5F\u662F\u6821\u89C4\u653F\u7B56\u77E5\u8BC6\u95EE\u7B54\u5165\u53E3" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickGroup, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickGroupLabel, children: "\u5FEB\u6377\u64CD\u4F5C" }), quickActions.map((a) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickBtn, onClick: () => onQuickTap(a), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickIconWrap, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: a.icon, color: "#3a6df0", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickTextGroup, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickText, children: a.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickDesc, children: a.desc })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickArrow, children: "\u203A" })] }, a.label)))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickGroup, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickGroupLabel, children: "\u77E5\u8BC6\u95EE\u7B54" }), kbActions.map((a) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickBtn, onClick: () => onQuickTap(a), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${AIChatDrawer_module_css_1.default.quickIconWrap} ${AIChatDrawer_module_css_1.default.quickIconWrapAlt}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: a.icon, color: "#5b6478", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.quickTextGroup, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickText, children: a.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickDesc, children: a.desc })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.quickArrow, children: "\u203A" })] }, a.label)))] })] })) : ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [messages.map((m, i) => ((0, jsx_runtime_1.jsx)(components_1.View, { id: `m${i}`, className: `${AIChatDrawer_module_css_1.default.bubbleRow} ${m.role === 'user' ? AIChatDrawer_module_css_1.default.bubbleRowUser : ''}`, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${AIChatDrawer_module_css_1.default.bubble} ${m.role === 'user' ? AIChatDrawer_module_css_1.default.bubbleUser : AIChatDrawer_module_css_1.default.bubbleAssistant}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { children: m.text }) }) }, i))), loading && ((0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.bubbleRow, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${AIChatDrawer_module_css_1.default.bubble} ${AIChatDrawer_module_css_1.default.bubbleAssistant} ${AIChatDrawer_module_css_1.default.thinking}`, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: AIChatDrawer_module_css_1.default.thinkingText, children: "\u6B63\u5728\u601D\u8003" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: AIChatDrawer_module_css_1.default.thinkingDots, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.thinkingDot }), (0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.thinkingDot }), (0, jsx_runtime_1.jsx)(components_1.View, { className: AIChatDrawer_module_css_1.default.thinkingDot })] })] }) }))] })) })] })] }));
}
//# sourceMappingURL=AIChatDrawer.js.map