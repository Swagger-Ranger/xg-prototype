"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SchedulePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const schedule_1 = require("../../api/schedule");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 我的课表 — Apple 玻璃感 × Day archetype。
 *
 * 周日~周一横向 segmented，点击切换日；当日课程以玻璃卡 feed 展示。
 * 当前数据源是 fetchSchedule mock；接真后只需替换 api/schedule.ts 实现。
 */
const DAY_LABELS = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
    6: '周六',
    7: '周日',
};
function todayDayOfWeek() {
    // JS 0=周日；本应用约定 1=周一 7=周日
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
}
function SchedulePage() {
    var _a;
    const [data, setData] = (0, react_1.useState)(null);
    const [activeDay, setActiveDay] = (0, react_1.useState)(todayDayOfWeek());
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        (0, schedule_1.fetchSchedule)()
            .then((res) => { if (!cancelled)
            setData(res); })
            .finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, []);
    const todayClasses = ((_a = data === null || data === void 0 ? void 0 : data.classes) !== null && _a !== void 0 ? _a : [])
        .filter((c) => c.day_of_week === activeDay)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const dayCounts = (() => {
        var _a, _b;
        const acc = {};
        for (const c of (_a = data === null || data === void 0 ? void 0 : data.classes) !== null && _a !== void 0 ? _a : []) {
            acc[c.day_of_week] = ((_b = acc[c.day_of_week]) !== null && _b !== void 0 ? _b : 0) + 1;
        }
        return acc;
    })();
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u6211\u7684\u8BFE\u8868" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: data ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["\u7B2C ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: data.week_index }), " \u5468 \u00B7 \u5171 ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: data.total_weeks }), " \u5468"] })) : ('加载中…') })] }), (0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollX: true, className: index_module_css_1.default.daysScroll, showScrollbar: false, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.days, children: [1, 2, 3, 4, 5, 6, 7].map((d) => {
                        var _a;
                        const count = (_a = dayCounts[d]) !== null && _a !== void 0 ? _a : 0;
                        const isActive = activeDay === d;
                        const isToday = todayDayOfWeek() === d;
                        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.day} ${isActive ? index_module_css_1.default.dayActive : ''} tap-min`, onClick: () => setActiveDay(d), children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.dayLabel, children: DAY_LABELS[d] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.dayCount} num`, children: count > 0 ? `${count} 节` : '休' }), isToday && !isActive && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.dayTodayDot })] }, d));
                    }) }) }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : todayClasses.length === 0 ? ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.empty, children: [DAY_LABELS[activeDay], "\u6CA1\u6709\u8BFE\uFF0C\u53EF\u4EE5\u4F11\u606F\u4E00\u4E0B"] })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: todayClasses.map((c) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.card} ${index_module_css_1.default[`tone_${c.tone}`]}`, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.timeCol, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.timeStart} num`, children: c.start_time }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.timeBar }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.timeEnd} num`, children: c.end_time })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.contentCol, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.courseName, children: c.course_name }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.metaRow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaItem, children: c.location }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaSep, children: " \u00B7 " }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaItem, children: c.teacher })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.periodChip, children: c.periods })] })] }, c.id))) })), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.footHint, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.footHintText, children: "\u8BFE\u8868\u6570\u636E\u63A5\u5165\u4E2D\uFF0C\u5F53\u524D\u4E3A\u793A\u4F8B" }) })] }));
}
//# sourceMappingURL=index.js.map