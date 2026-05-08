"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CustomTabBar;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../utils/icons");
const aiChat_1 = require("../stores/aiChat");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const NAV_TABS = [
    { path: '/pages/home/index', icon: 'home', label: '首页' },
    { path: '/pages/apps/index', icon: 'grid', label: '应用' },
    { path: '/pages/profile/index', icon: 'user', label: '个人中心' },
];
function CustomTabBar() {
    const [currentPath, setCurrentPath] = (0, react_1.useState)('');
    const [input, setInput] = (0, react_1.useState)('');
    const [recording, setRecording] = (0, react_1.useState)(false);
    const [partialText, setPartialText] = (0, react_1.useState)('');
    const managerRef = (0, react_1.useRef)(null);
    // store 暴露的 send 是发送 + history 注入 + action 派发的单一入口；
    // dock 输入和 drawer quick action 都走它，保证体验一致
    const isOpen = (0, aiChat_1.useAIChatStore)((s) => s.isOpen);
    const open = (0, aiChat_1.useAIChatStore)((s) => s.open);
    const sendMessage = (0, aiChat_1.useAIChatStore)((s) => s.send);
    const loading = (0, aiChat_1.useAIChatStore)((s) => s.loading);
    (0, react_1.useEffect)(() => {
        const router = taro_1.default.getCurrentInstance().router;
        if (router === null || router === void 0 ? void 0 : router.path)
            setCurrentPath('/' + router.path);
    }, []);
    const switchTo = (path) => {
        if (path === currentPath)
            return;
        taro_1.default.switchTab({ url: path });
    };
    const ensureManager = () => {
        if (managerRef.current)
            return managerRef.current;
        let plugin;
        try {
            plugin = taro_1.default
                .requirePlugin('WechatSI');
        }
        catch (_a) {
            taro_1.default.showToast({ title: '语音插件未授权（去 mp 后台加同声传译）', icon: 'none' });
            return null;
        }
        const m = plugin.getRecordRecognitionManager();
        m.onStart(() => setRecording(true));
        m.onRecognize((res) => setPartialText(res.result || ''));
        m.onStop((res) => {
            setRecording(false);
            setPartialText('');
            const final = (res.result || '').trim();
            if (final)
                setInput((prev) => (prev ? prev + final : final));
        });
        m.onError((err) => {
            setRecording(false);
            setPartialText('');
            taro_1.default.showToast({ title: `识别失败：${err.retdesc}`, icon: 'none' });
        });
        managerRef.current = m;
        return m;
    };
    const startRecord = () => {
        const m = ensureManager();
        if (!m)
            return;
        m.start({ duration: 30000, lang: 'zh_CN' });
    };
    const stopRecord = () => {
        if (managerRef.current && recording)
            managerRef.current.stop();
    };
    const send = () => {
        const text = input.trim();
        if (!text || loading)
            return;
        setInput('');
        if (!isOpen)
            open();
        void sendMessage(text);
    };
    // 注意：AIChatDrawer 挂在 App 层（src/app.tsx），不在这里。
    // 见 app.tsx 的注释说明（mini-app custom-tab-bar 的 fixed 元素受限）。
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [recording && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.voiceOverlay, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.voiceOverlayDotRow, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.voiceOverlayDot }), (0, jsx_runtime_1.jsx)(components_1.Text, { children: "\u6B63\u5728\u542C\u2026\u518D\u70B9\u9EA6\u514B\u98CE\u7ED3\u675F" })] }), partialText ? (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.voiceOverlayText, children: partialText }) : null] })), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.dock, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.aiInputBar, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.inputPill, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.inputLeadChip, children: [(0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "sparkles", color: "#3a6df0", size: 26 }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.inputLeadLabel, children: "AI \u52A9\u624B" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.inputLeadSep }), (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, placeholder: "\u95EE\u95EE\u4EFB\u4F55\u6821\u5185\u4E8B\u52A1\u2026", value: input, confirmType: "send", onInput: (e) => setInput(e.detail.value), onFocus: () => !isOpen && open(), onConfirm: () => send() })] }), input.trim() ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionBtnSend}`, onClick: send, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "send", color: "#ffffff", weight: 2, size: 30 }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${recording ? index_module_css_1.default.actionBtnRec : ''}`, onTouchStart: startRecord, onTouchEnd: stopRecord, onTouchCancel: stopRecord, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "mic", color: recording ? '#dc2626' : '#475569', weight: 2, size: 32 }) }))] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tabRow, children: NAV_TABS.map((t) => {
                            const active = currentPath === t.path;
                            return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.tab, onClick: () => switchTo(t.path), children: [(0, jsx_runtime_1.jsx)(icons_1.Icon, { name: t.icon, color: active ? '#4f46e5' : '#64748b', weight: active ? 2 : 1.8, size: 40 }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: active ? index_module_css_1.default.tabLabelActive : index_module_css_1.default.tabLabel, children: t.label })] }, t.path));
                        }) })] })] }));
}
//# sourceMappingURL=index.js.map