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
exports.default = MyWorkStudyPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const workStudy_1 = require("../../api/workStudy");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const APP_STATUS_LABEL = {
    pending: '审批中',
    recommended: '已推荐',
    hired: '已录用',
    rejected: '未通过',
};
const APP_STATUS_TONE = {
    pending: 'pending',
    recommended: 'warn',
    hired: 'ok',
    rejected: 'danger',
};
const SALARY_STATUS_LABEL = {
    draft: '草稿',
    pending: '审批中',
    confirmed: '已确认',
    rejected: '已驳回',
    paid: '已支付',
};
const SALARY_STATUS_TONE = {
    draft: 'muted',
    pending: 'pending',
    confirmed: 'warn', // 已确认但未发放，用 warn 更突出"待发放"
    rejected: 'danger',
    paid: 'ok',
};
const UNIT_LABEL = {
    hour: '时', day: '天', month: '月', per_task: '次',
};
function groupSalariesByMonth(rows) {
    const map = new Map();
    for (const s of rows) {
        if (!map.has(s.month))
            map.set(s.month, { month: s.month, total: 0, rows: [] });
        const g = map.get(s.month);
        g.rows.push(s);
        if (s.status === 'confirmed' || s.status === 'paid') {
            g.total += Number(s.amount) || 0;
        }
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
}
function MyWorkStudyPage() {
    const router = (0, taro_1.useRouter)();
    const initialTab = router.params.tab === 'salary' ? 'salary' : 'apps';
    const [tab, setTab] = (0, react_1.useState)(initialTab);
    const [apps, setApps] = (0, react_1.useState)([]);
    const [salaries, setSalaries] = (0, react_1.useState)([]);
    const [loadingApps, setLoadingApps] = (0, react_1.useState)(true);
    const [loadingSalary, setLoadingSalary] = (0, react_1.useState)(true);
    const load = (0, react_1.useCallback)(async () => {
        const userId = String(taro_1.default.getStorageSync('userId') || '');
        if (!userId) {
            taro_1.default.showToast({ title: '请先登录', icon: 'none' });
            taro_1.default.reLaunch({ url: '/pages/login/index' });
            return;
        }
        setLoadingApps(true);
        setLoadingSalary(true);
        // 两条并发，互不阻塞
        (0, workStudy_1.listMyApplications)(userId, 1, 100)
            .then((r) => { var _a; return setApps((_a = r.data) !== null && _a !== void 0 ? _a : []); })
            .catch((e) => taro_1.default.showToast({ title: e.message, icon: 'none' }))
            .finally(() => setLoadingApps(false));
        (0, workStudy_1.listMySalaries)(userId, 1, 100)
            .then((r) => { var _a; return setSalaries((_a = r.data) !== null && _a !== void 0 ? _a : []); })
            .catch((e) => taro_1.default.showToast({ title: e.message, icon: 'none' }))
            .finally(() => setLoadingSalary(false));
    }, []);
    (0, react_1.useEffect)(() => { load(); }, [load]);
    (0, taro_1.useDidShow)(() => { load(); });
    const settledTotal = salaries
        .filter((s) => s.status === 'confirmed' || s.status === 'paid')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const groups = groupSalariesByMonth(salaries);
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u6211\u7684\u52E4\u5DE5" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: tab === 'apps'
                            ? (0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["\u5171 ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: apps.length }), " \u4EFD\u7533\u8BF7"] })
                            : (0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["\u7D2F\u8BA1\u5E94\u5F97 ", (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "num", children: ["\u00A5", settledTotal.toFixed(2)] })] }) })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.tabsWrap, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.tabs, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.tab} ${tab === 'apps' ? index_module_css_1.default.tabActive : ''} tap-min`, onClick: () => setTab('apps'), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.tabLabel, children: "\u7533\u8BF7" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.tab} ${tab === 'salary' ? index_module_css_1.default.tabActive : ''} tap-min`, onClick: () => setTab('salary'), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.tabLabel, children: "\u85AA\u8D44" }) })] }) }), tab === 'apps' ? ((0, jsx_runtime_1.jsx)(ApplicationsList, { apps: apps, loading: loadingApps })) : ((0, jsx_runtime_1.jsx)(SalariesList, { groups: groups, loading: loadingSalary }))] }));
}
function ApplicationsList({ apps, loading }) {
    if (loading)
        return (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" });
    if (apps.length === 0) {
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.emptyAction, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.empty, children: "\u8FD8\u6CA1\u6709\u7533\u8BF7\u8BB0\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.ctaBtn} tap-min`, onClick: () => taro_1.default.navigateTo({ url: '/pages/workStudy/index' }), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaBtnLabel, children: "\u770B\u770B\u5728\u62DB\u5C97\u4F4D" }) })] }));
    }
    return ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: apps.map((a) => {
            var _a, _b, _c, _d, _e;
            const tone = (_a = APP_STATUS_TONE[a.status]) !== null && _a !== void 0 ? _a : 'muted';
            return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, onClick: () => taro_1.default.navigateTo({ url: `/pages/workStudyDetail/index?id=${a.position_id}` }), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.cardTitle, children: ((_b = a.position_summary) === null || _b === void 0 ? void 0 : _b.title) || `岗位 #${a.position_id}` }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPill} ${index_module_css_1.default[`tone_${tone}`]}`, children: (_c = APP_STATUS_LABEL[a.status]) !== null && _c !== void 0 ? _c : a.status })] }), a.intro && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.intro, numberOfLines: 2, children: a.intro })), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.timestamp, children: ["\u63D0\u4EA4\u4E8E ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: (_e = (_d = a.created_at) === null || _d === void 0 ? void 0 : _d.slice(0, 10)) !== null && _e !== void 0 ? _e : '—' })] })] }, a.id));
        }) }));
}
function SalariesList({ groups, loading }) {
    if (loading)
        return (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" });
    if (groups.length === 0)
        return (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u6682\u65E0\u85AA\u8D44\u8BB0\u5F55" });
    return ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: groups.map((g) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.monthGroup, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.monthHeader, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.monthLabel, children: g.month }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.monthTotal} num`, children: ["\u00A5", g.total.toFixed(2)] })] }), g.rows.map((s) => {
                    var _a, _b, _c, _d, _e;
                    const tone = (_a = SALARY_STATUS_TONE[s.status]) !== null && _a !== void 0 ? _a : 'muted';
                    const detail = s.units && s.unit_type
                        ? `${Number(s.units).toFixed(1)} ${(_b = UNIT_LABEL[s.unit_type]) !== null && _b !== void 0 ? _b : s.unit_type} × ¥${s.unit_rate ? Number(s.unit_rate).toFixed(2) : '?'}`
                        : s.hours
                            ? `${Number(s.hours).toFixed(1)} 小时 × ¥${s.hourly_rate ? Number(s.hourly_rate).toFixed(2) : '?'}`
                            : '—';
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.salaryCard, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.amountWrap, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.amount} num`, children: ["\u00A5", Number(s.amount).toFixed(2)] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.amountSub, children: (_d = (_c = s.position_summary) === null || _c === void 0 ? void 0 : _c.title) !== null && _d !== void 0 ? _d : `岗位 #${s.position_id}` })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPill} ${index_module_css_1.default[`tone_${tone}`]}`, children: (_e = SALARY_STATUS_LABEL[s.status]) !== null && _e !== void 0 ? _e : s.status })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.detail, children: detail })] }, s.id));
                })] }, g.month))) }));
}
//# sourceMappingURL=index.js.map