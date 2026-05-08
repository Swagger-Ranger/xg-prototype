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
exports.default = ClassLeavePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const leave_1 = require("../../../api/leave");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const TABS = [
    { key: 'all', label: '全部' },
    { key: 'uncancelled', label: '未销假' },
];
function formatDate(s) {
    if (!s)
        return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime()))
        return s;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
}
function ClassLeavePage() {
    const [tab, setTab] = (0, react_1.useState)('all');
    const [items, setItems] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [busyId, setBusyId] = (0, react_1.useState)(null);
    const load = (0, react_1.useCallback)(async (which) => {
        var _a;
        setLoading(true);
        try {
            const fetcher = which === 'uncancelled' ? leave_1.listUncancelledLeaves : leave_1.listClassLeaves;
            const res = await fetcher({ page: 1, size: 100 });
            setItems((_a = res.data) !== null && _a !== void 0 ? _a : []);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => { load(tab); }, [load, tab]);
    (0, taro_1.useDidShow)(() => { load(tab); });
    const goDetail = (id) => {
        taro_1.default.navigateTo({ url: `/pages/leave/detail/index?id=${id}` });
    };
    const onConfirmCancel = (id) => {
        taro_1.default.showModal({
            title: '确认销假',
            content: '确认该学生的销假申请？通过后状态变为「已销」。',
            confirmText: '确认',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusyId(id);
                try {
                    await (0, leave_1.confirmCancelLeave)(id);
                    taro_1.default.showToast({ title: '已确认销假', icon: 'success' });
                    await load(tab);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '确认失败', icon: 'none' });
                }
                finally {
                    setBusyId(null);
                }
            },
        });
    };
    const onForceCancel = (id) => {
        taro_1.default.showModal({
            title: '强制销假',
            content: '此操作不可撤销，仅在学生未自行销假时使用。',
            confirmText: '确认强制销假',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusyId(id);
                try {
                    await (0, leave_1.forceCancelLeave)(id);
                    taro_1.default.showToast({ title: '已强制销假', icon: 'success' });
                    await load(tab);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '操作失败', icon: 'none' });
                }
                finally {
                    setBusyId(null);
                }
            },
        });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u73ED\u7EA7\u8BF7\u5047" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: ["\u5171 ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: items.length }), " \u6761"] })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tabsWrap, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tabs, children: TABS.map((t) => ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.tab} ${tab === t.key ? index_module_css_1.default.tabActive : ''} tap-min`, onClick: () => setTab(t.key), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.tabLabel, children: t.label }) }, t.key))) }) }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : items.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: tab === 'uncancelled' ? '没有未销假的请假记录' : '本班暂无请假' })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: items.map((r) => {
                    var _a, _b;
                    const tone = leave_1.LEAVE_STATUS_TONES[r.status];
                    const showConfirmBtn = r.status === 'cancel_pending';
                    const showForceBtn = r.status === 'approved' && tab === 'uncancelled';
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, onClick: () => goDetail(r.id), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.titleWrap, children: (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.cardTitle, children: [(_a = r.student_name) !== null && _a !== void 0 ? _a : '未知学生', (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.titleDim, children: [" \u00B7 ", (_b = r.leave_type_name) !== null && _b !== void 0 ? _b : '请假'] })] }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPill} ${index_module_css_1.default[`tone_${tone}`]}`, children: leave_1.LEAVE_STATUS_LABELS[r.status] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.metaRow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaText, children: (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "num", children: [formatDate(r.start_time), " ~ ", formatDate(r.end_time)] }) }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.duration, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: r.duration_days }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.durationUnit, children: " \u5929" })] })] }), r.reason && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.reason, numberOfLines: 2, children: r.reason })), (showConfirmBtn || showForceBtn) && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.actions, children: [showConfirmBtn && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionPrimary} tap-min`, onClick: (e) => { e.stopPropagation(); onConfirmCancel(r.id); }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.actionLabel, children: busyId === r.id ? '处理中…' : '确认销假' }) })), showForceBtn && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionDanger} tap-min`, onClick: (e) => { e.stopPropagation(); onForceCancel(r.id); }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.actionLabelDanger, children: busyId === r.id ? '处理中…' : '强制销假' }) }))] }))] }, r.id));
                }) }))] }));
}
//# sourceMappingURL=index.js.map