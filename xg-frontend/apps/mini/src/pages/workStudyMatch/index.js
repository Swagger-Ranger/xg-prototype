"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = WorkStudyMatch;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const workStudy_1 = require("../../api/workStudy");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const DAYS = [
    { code: 'mon', label: '周一' },
    { code: 'tue', label: '周二' },
    { code: 'wed', label: '周三' },
    { code: 'thu', label: '周四' },
    { code: 'fri', label: '周五' },
    { code: 'sat', label: '周六' },
    { code: 'sun', label: '周日' },
];
const BANDS = [
    { key: 'morning', label: '上午 8-12', start: '08:00', end: '12:00' },
    { key: 'afternoon', label: '下午 14-18', start: '14:00', end: '18:00' },
    { key: 'evening', label: '晚上 18-22', start: '18:00', end: '22:00' },
];
function WorkStudyMatch() {
    const [positionType, setPositionType] = (0, react_1.useState)('');
    const [campus, setCampus] = (0, react_1.useState)('');
    const [minRate, setMinRate] = (0, react_1.useState)('');
    const [keyword, setKeyword] = (0, react_1.useState)('');
    const [picked, setPicked] = (0, react_1.useState)(new Set());
    const [output, setOutput] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const slots = (0, react_1.useMemo)(() => {
        const out = [];
        for (const b of BANDS) {
            for (const d of DAYS) {
                const k = `${b.key}:${d.code}`;
                if (picked.has(k))
                    out.push({ day: d.code, start: b.start, end: b.end });
            }
        }
        return out;
    }, [picked]);
    const togglePicked = (k) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(k))
                next.delete(k);
            else
                next.add(k);
            return next;
        });
    };
    const buildPref = () => {
        const pref = {};
        if (positionType)
            pref.position_type = positionType;
        if (campus)
            pref.campus = campus;
        if (minRate)
            pref.min_rate = Number(minRate);
        const k = keyword.trim();
        if (k)
            pref.keyword = k;
        return pref;
    };
    const runMatch = async () => {
        if (slots.length === 0) {
            taro_1.default.showToast({ title: '先点选有空的时段', icon: 'none' });
            return;
        }
        setLoading(true);
        try {
            const text = await (0, workStudy_1.matchToSchedule)(slots);
            setOutput(text);
        }
        catch (e) {
            taro_1.default.showToast({ title: e.message || 'AI 调用失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    };
    const runFind = async () => {
        setLoading(true);
        try {
            const text = await (0, workStudy_1.findByPreference)(buildPref());
            setOutput(text);
        }
        catch (e) {
            taro_1.default.showToast({ title: e.message || 'AI 调用失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    };
    // The AI tool prefixes each result row with "- #<id> <title>...".
    // Render those as tappable lines to the detail page; keep other lines as text.
    const lines = (output || '').split('\n');
    const goDetail = (raw) => {
        // Match "- #<id> ..." to extract numeric id.
        const m = raw.match(/^[-•]?\s*#(\d+)/);
        if (!m)
            return;
        taro_1.default.navigateTo({ url: `/pages/workStudyDetail/index?id=${m[1]}` });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u6211\u7684\u504F\u597D" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionHint, children: "\u4E0D\u9009\u5C31\u662F\u4E0D\u9650" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u7C7B\u578B" }), ['', 'fixed', 'temporary'].map((v) => ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.chip} ${positionType === v ? index_module_css_1.default.chipActive : ''}`, onClick: () => setPositionType(v), children: v === '' ? '全部' : v === 'fixed' ? '固定岗' : '临时岗' }, v || 'any')))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u6821\u533A" }), ['', '本部', '新校区'].map((v) => ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.chip} ${campus === v ? index_module_css_1.default.chipActive : ''}`, onClick: () => setCampus(v), children: v === '' ? '全部' : v }, v || 'any')))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u85AA\u8D44" }), ['', '15', '18', '20'].map((v) => ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.chip} ${minRate === v ? index_module_css_1.default.chipActive : ''}`, onClick: () => setMinRate(v), children: v === '' ? '不限' : `≥¥${v}` }, v || 'any')))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u5173\u952E\u8BCD" }), (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.kwInput, placeholder: "\u4F8B\uFF1A\u56FE\u4E66\u9986 / \u98DF\u5802\uFF08\u53EF\u4E0D\u586B\uFF09", value: keyword, onInput: (e) => setKeyword(e.detail.value), maxlength: 30 })] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u6211\u7684\u7A7A\u95F2\u65F6\u6BB5" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionHint, children: "\u70B9\u9009\u54EA\u5929\u54EA\u6BB5\u6709\u7A7A\uFF0C\u53EF\u591A\u9009" }), BANDS.map((b) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.bandBlock, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.bandLabel, children: b.label }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.bandRow, children: DAYS.map((d) => {
                                    const k = `${b.key}:${d.code}`;
                                    const active = picked.has(k);
                                    return ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.dayCell} ${active ? index_module_css_1.default.dayCellActive : ''}`, onClick: () => togglePicked(k), children: d.label.slice(1) }, k));
                                }) })] }, b.key)))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.actions, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.actionBtn} ${slots.length === 0 ? index_module_css_1.default.actionBtnDisabled : ''}`, onClick: runMatch, children: ["\u6309\u65F6\u95F4\u5339\u914D (", slots.length, ")"] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.actionBtn} ${index_module_css_1.default.actionBtnSecondary}`, onClick: runFind, children: "\u6309\u504F\u597D\u7B5B" })] }), loading && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.loading, children: "AI \u5206\u6790\u4E2D\u2026" }), output && !loading && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.resultSection, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "AI \u63A8\u8350" }), lines.map((ln, i) => {
                        const linkable = /^[-•]?\s*#\d+/.test(ln);
                        return ((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.resultLine} ${linkable ? index_module_css_1.default.resultLineLink : ''}`, onClick: linkable ? () => goDetail(ln) : undefined, children: ln || ' ' }, i));
                    })] })), !output && !loading && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.emptyTip, children: "\u9009\u597D\u540E\u70B9\u4E0A\u9762\u6309\u94AE" }))] }));
}
//# sourceMappingURL=index.js.map