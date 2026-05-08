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
exports.default = LeaveApprovalPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const workflow_1 = require("../../../api/workflow");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 请假审批 — Apple 玻璃感 × Feed archetype。
 * 列出"我作为审批人"的待审任务（biz_type === 'leave'），
 * 点击进入 detail 页（带 taskId 参数）触发批准/驳回 UI。
 */
const RISK_LABEL = {
    low: '低',
    medium: '中',
    high: '高',
};
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
function LeaveApprovalPage() {
    const [items, setItems] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const load = (0, react_1.useCallback)(async () => {
        var _a;
        const userId = String(taro_1.default.getStorageSync('userId') || '');
        if (!userId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await (0, workflow_1.listPendingEnriched)({ page: 1, size: 100, assigneeId: userId });
            // 仅保留请假；其它业务（如勤工申请）走自己的页面
            const leaves = ((_a = res.data) !== null && _a !== void 0 ? _a : []).filter((t) => t.biz_type === 'leave');
            setItems(leaves);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => {
        load();
    }, [load]);
    // 审批完成回到列表后刷新
    (0, taro_1.useDidShow)(() => {
        load();
    });
    const goDetail = (task) => {
        if (!task.biz_id)
            return;
        taro_1.default.navigateTo({
            url: `/pages/leave/detail/index?id=${task.biz_id}&taskId=${task.id}`,
        });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u8BF7\u5047\u5BA1\u6279" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: ["\u5F85\u5BA1 ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: items.length }), " \u6761"] })] }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : items.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u6682\u65E0\u5F85\u5BA1\u8BF7\u5047" })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: items.map((t) => {
                    var _a, _b, _c;
                    const days = (_a = t.leave_duration_days) !== null && _a !== void 0 ? _a : '?';
                    const range = t.leave_start_time && t.leave_end_time
                        ? `${formatDate(t.leave_start_time)} ~ ${formatDate(t.leave_end_time)}`
                        : '';
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, onClick: () => goDetail(t), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.titleWrap, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.cardTitle, children: [(_b = t.initiator_name) !== null && _b !== void 0 ? _b : '未知学生', (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.titleDim, children: [" \u00B7 ", (_c = t.leave_type_name) !== null && _c !== void 0 ? _c : '请假'] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.nodeMeta, children: t.node_name })] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.riskPill} ${index_module_css_1.default[`risk_${t.risk_level}`]}`, children: ["\u98CE\u9669", RISK_LABEL[t.risk_level]] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.metaRow, children: [range && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaText, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: range }) })), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.duration, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: days }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.durationUnit, children: " \u5929" })] })] }), t.leave_reason && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.reason, numberOfLines: 2, children: t.leave_reason })), t.reasons.length > 0 && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tags, children: t.reasons.slice(0, 3).map((r, i) => ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.tag, children: r }, i))) }))] }, t.id));
                }) }))] }));
}
//# sourceMappingURL=index.js.map