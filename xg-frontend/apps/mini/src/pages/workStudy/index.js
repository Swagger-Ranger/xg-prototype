"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = WorkStudyList;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const workStudy_1 = require("../../api/workStudy");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const SALARY_UNIT_LABEL = {
    hour: '时', day: '天', month: '月', per_task: '次',
};
function WorkStudyList() {
    const [positions, setPositions] = (0, react_1.useState)([]);
    const [total, setTotal] = (0, react_1.useState)(0);
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        setLoading(true);
        (0, workStudy_1.listOpenPositions)(1, 50)
            .then((res) => {
            var _a, _b;
            if (cancelled)
                return;
            setPositions((_a = res.data) !== null && _a !== void 0 ? _a : []);
            setTotal(Number((_b = res.total) !== null && _b !== void 0 ? _b : 0));
        })
            .catch((err) => {
            taro_1.default.showToast({ title: err.message || '加载失败', icon: 'none' });
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);
    const goDetail = (id) => {
        taro_1.default.navigateTo({ url: `/pages/workStudyDetail/index?id=${id}` });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u52E4\u5DE5\u52A9\u5B66" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: ["\u5728\u62DB ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: total }), " \u4E2A\u5C97\u4F4D \u00B7 \u7B49\u4F60\u6765\u6311"] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.ctaCard} tap-min`, onClick: () => taro_1.default.navigateTo({ url: '/pages/workStudyMatch/index' }), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.ctaMark, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.ctaMarkText} display`, children: "AI" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.ctaText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaTitle, children: "\u5E2E\u6211\u627E\u6700\u5339\u914D\u7684\u5C97\u4F4D" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaHint, children: "\u9009\u7A7A\u95F2\u65F6\u6BB5 + \u504F\u597D\uFF0C\u81EA\u52A8\u63A8\u8350" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.ctaArrow, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.ctaArrowGlyph, children: "\u203A" }) })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u5168\u90E8\u5728\u62DB" }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionLine })] }), loading ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" })) : positions.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u6682\u65E0\u7B26\u5408\u4F60\u6761\u4EF6\u7684\u5C97\u4F4D" })) : ((0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.list, children: positions.map((p) => {
                    var _a, _b;
                    const isTemp = p.position_type === 'temporary';
                    const salaryAmount = p.salary_amount || p.hourly_rate;
                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, onClick: () => goDetail(p.id), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.cardHeader, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.cardTitle, children: p.title }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.typeBadge} ${isTemp ? index_module_css_1.default.typeBadgeTemp : ''}`, children: isTemp ? '临时岗' : '固定岗' })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.meta, children: [
                                    p.department_name,
                                    p.campus,
                                    p.weekly_hours ? `周 ${p.weekly_hours} 小时` : null,
                                ]
                                    .filter(Boolean)
                                    .map((label, i, arr) => ((0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.metaItem, children: [label, i < arr.length - 1 && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.metaSep, children: " \u00B7 " })] }, i))) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.foot, children: [salaryAmount ? ((0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.salary, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: "num", children: ["\u00A5", Number(salaryAmount).toFixed(2)] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.salaryUnit, children: ["/", SALARY_UNIT_LABEL[p.salary_unit || 'hour'] || '时'] })] })) : ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.salaryEmpty, children: "\u9762\u8BAE" })), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.headcount, children: ["\u62DB\u00A0", (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "num", children: [(_a = p.hired_count) !== null && _a !== void 0 ? _a : 0, "/", (_b = p.headcount) !== null && _b !== void 0 ? _b : '?'] })] })] })] }, p.id));
                }) }))] }));
}
//# sourceMappingURL=index.js.map