"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = NotificationsPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const notification_1 = require("../../api/notification");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 通知 — Apple 玻璃感 × Feed archetype。
 * 时间倒序卡片；点击 → markRead + (可选) 深链跳转。
 */
const LEVEL_LABEL = {
    normal: '通知',
    important: '重要',
    urgent: '紧急',
};
function formatRelative(s) {
    if (!s)
        return '';
    const t = new Date(s).getTime();
    if (Number.isNaN(t))
        return s;
    const now = Date.now();
    const diff = Math.max(0, now - t);
    const min = Math.floor(diff / 60000);
    if (min < 1)
        return '刚刚';
    if (min < 60)
        return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 7)
        return `${day} 天前`;
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function NotificationsPage() {
    const [items, setItems] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const load = (0, react_1.useCallback)(async () => {
        var _a;
        setLoading(true);
        try {
            const res = await (0, notification_1.listMyNotifications)(1, 100);
            setItems((_a = res.data) !== null && _a !== void 0 ? _a : []);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => { load(); }, [load]);
    (0, taro_1.useDidShow)(() => { load(); });
    const onTap = async (n) => {
        // 先乐观置已读，再后台 markRead；接口失败也不阻塞跳转
        if (!n.read) {
            setItems((prev) => prev.map((x) => (x.id === n.id ? Object.assign(Object.assign({}, x), { read: true }) : x)));
            (0, notification_1.markAsRead)(n.id).catch(() => {
                // 静默：UI 已置已读，下次刷新会修正
            });
        }
        const url = (0, notification_1.notificationDeeplink)(n);
        if (url) {
            taro_1.default.navigateTo({ url }).catch(() => {
                taro_1.default.showToast({ title: '该来源页面不存在', icon: 'none' });
            });
        }
    };
    const unreadCount = items.filter((n) => !n.read).length;
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u901A\u77E5" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: unreadCount > 0 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: unreadCount }), " \u6761\u672A\u8BFB"] })) : ('已全部查看') })] }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : items.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u6682\u65E0\u901A\u77E5" })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: items.map((n) => {
                    const deeplink = (0, notification_1.notificationDeeplink)(n);
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.card} ${n.read ? index_module_css_1.default.cardRead : index_module_css_1.default.cardUnread}`, onClick: () => onTap(n), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.titleWrap, children: [!n.read && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.unreadDot }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.cardTitle, numberOfLines: 1, children: n.title })] }), n.level !== 'normal' && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.levelPill} ${index_module_css_1.default[`level_${n.level}`]}`, children: LEVEL_LABEL[n.level] }))] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.cardBody, numberOfLines: 3, children: n.content }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardFoot, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.timeText, children: formatRelative(n.created_at) }), deeplink && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.openLink, children: "\u67E5\u770B \u203A" })] })] }, n.id));
                }) }))] }));
}
//# sourceMappingURL=index.js.map