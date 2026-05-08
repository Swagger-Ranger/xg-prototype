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
exports.default = MyLeavesPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const leave_1 = require("../../../api/leave");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const STATUS_OPTIONS = [
    { label: '全部', value: '' },
    { label: '审批中', value: 'pending' },
    { label: '已通过', value: 'approved' },
    { label: '销假中', value: 'cancel_pending' },
    { label: '已驳回', value: 'rejected' },
];
function formatDate(s) {
    if (!s)
        return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime()))
        return s;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
function MyLeavesPage() {
    var _a, _b;
    const [items, setItems] = (0, react_1.useState)([]);
    const [status, setStatus] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [busyId, setBusyId] = (0, react_1.useState)(null);
    const load = (0, react_1.useCallback)(async (filterStatus) => {
        var _a;
        setLoading(true);
        try {
            const res = await (0, leave_1.listMyLeaves)({
                page: 1,
                size: 50,
                status: filterStatus || undefined,
            });
            setItems((_a = res.data) !== null && _a !== void 0 ? _a : []);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : '加载失败';
            taro_1.default.showToast({ title: msg, icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => {
        load(status);
    }, [load, status]);
    // Refresh on return from apply / detail page so newly-submitted records show up.
    (0, taro_1.useDidShow)(() => {
        load(status);
    });
    const goApply = () => {
        taro_1.default.navigateTo({ url: '/pages/leave/apply/index' });
    };
    const goDetail = (id) => {
        taro_1.default.navigateTo({ url: `/pages/leave/detail/index?id=${id}` });
    };
    const onWithdraw = (id) => {
        taro_1.default.showModal({
            title: '确认撤回',
            content: '撤回后该申请将作废，可重新提交。',
            confirmText: '确定撤回',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusyId(id);
                try {
                    await (0, leave_1.withdrawLeave)(id);
                    taro_1.default.showToast({ title: '已撤回', icon: 'success' });
                    await load(status);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '撤回失败', icon: 'none' });
                }
                finally {
                    setBusyId(null);
                }
            },
        });
    };
    const onCancel = (id) => {
        taro_1.default.showModal({
            title: '申请销假',
            content: '提交销假申请，由辅导员确认。',
            confirmText: '提交销假',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusyId(id);
                try {
                    await (0, leave_1.cancelLeave)(id);
                    taro_1.default.showToast({ title: '销假已提交', icon: 'success' });
                    await load(status);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '销假失败', icon: 'none' });
                }
                finally {
                    setBusyId(null);
                }
            },
        });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u6211\u7684\u8BF7\u5047" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: ["\u5171 ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: items.length }), " \u6761\u8BB0\u5F55"] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.ctaCard} tap-min`, onClick: goApply, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.ctaMark, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.ctaMarkText} display`, children: "+" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.ctaText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaTitle, children: "\u7533\u8BF7\u8BF7\u5047" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaHint, children: "\u9009\u5047\u522B \u00B7 \u8D77\u6B62 \u00B7 \u539F\u56E0\uFF0C\u4E00\u5206\u949F\u641E\u5B9A" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.ctaArrow, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaArrowGlyph, children: "\u203A" }) })] }), (0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollX: true, className: index_module_css_1.default.tabsScroll, showScrollbar: false, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tabs, children: STATUS_OPTIONS.map((opt) => ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.tab} ${status === opt.value ? index_module_css_1.default.tabActive : ''}`, onClick: () => setStatus(opt.value), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.tabLabel, children: opt.label }) }, opt.value || 'all'))) }) }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : items.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: status ? `暂无${(_b = (_a = STATUS_OPTIONS.find((o) => o.value === status)) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : ''}的请假` : '还没有请假记录，点上方按钮申请一条' })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: items.map((r) => {
                    const tone = leave_1.LEAVE_STATUS_TONES[r.status];
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, onClick: () => goDetail(r.id), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.cardTitle, children: r.leave_type_name || '请假' }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPill} ${index_module_css_1.default[`tone_${tone}`]}`, children: leave_1.LEAVE_STATUS_LABELS[r.status] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.metaRow, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.metaText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: formatDate(r.start_time) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaSep, children: " ~ " }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: formatDate(r.end_time) })] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.duration, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: r.duration_days }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.durationUnit, children: "\u5929" })] })] }), r.reason && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.reason, numberOfLines: 2, children: r.reason })), (r.status === 'pending' || r.status === 'approved') && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.actions, children: [r.status === 'pending' && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionWarn} tap-min`, onClick: (e) => { e.stopPropagation(); onWithdraw(r.id); }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.actionLabel, children: busyId === r.id ? '处理中…' : '撤回' }) })), r.status === 'approved' && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionPrimary} tap-min`, onClick: (e) => { e.stopPropagation(); onCancel(r.id); }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.actionLabel, children: busyId === r.id ? '处理中…' : '申请销假' }) }))] }))] }, r.id));
                }) }))] }));
}
//# sourceMappingURL=index.js.map