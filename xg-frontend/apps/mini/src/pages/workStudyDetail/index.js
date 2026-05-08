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
exports.default = WorkStudyDetail;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const workStudy_1 = require("../../api/workStudy");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const SALARY_UNIT_LABEL = {
    hour: '时', day: '天', month: '月', per_task: '次',
};
function WorkStudyDetail() {
    var _a, _b, _c, _d, _e;
    const router = (0, taro_1.useRouter)();
    const positionId = String(router.params.id || '');
    const [pos, setPos] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [applyOpen, setApplyOpen] = (0, react_1.useState)(false);
    const [intro, setIntro] = (0, react_1.useState)('');
    const [submitting, setSubmitting] = (0, react_1.useState)(false);
    const [drafting, setDrafting] = (0, react_1.useState)(false);
    const handleAiDraft = async () => {
        if (!pos)
            return;
        try {
            setDrafting(true);
            taro_1.default.showLoading({ title: 'AI 起草中…' });
            const draft = await (0, workStudy_1.draftApplicationIntro)(pos.id);
            setIntro(draft);
            setApplyOpen(true);
            taro_1.default.showToast({ title: '草稿已生成，请按需修改', icon: 'none' });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'AI 起草失败';
            taro_1.default.showToast({ title: msg, icon: 'none' });
        }
        finally {
            taro_1.default.hideLoading();
            setDrafting(false);
        }
    };
    (0, react_1.useEffect)(() => {
        if (!positionId) {
            taro_1.default.showToast({ title: '岗位 ID 缺失', icon: 'none' });
            return;
        }
        setLoading(true);
        (0, workStudy_1.getPosition)(positionId)
            .then(setPos)
            .catch((err) => taro_1.default.showToast({ title: err.message, icon: 'none' }))
            .finally(() => setLoading(false));
    }, [positionId]);
    const handleApply = async () => {
        if (!pos)
            return;
        if (intro.trim().length < 10) {
            taro_1.default.showToast({ title: '申请理由至少 10 字', icon: 'none' });
            return;
        }
        try {
            setSubmitting(true);
            await (0, workStudy_1.applyToPosition)(pos.id, intro.trim());
            taro_1.default.showToast({ title: '申请已提交', icon: 'success' });
            setApplyOpen(false);
            setIntro('');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : '申请失败';
            taro_1.default.showToast({ title: msg, icon: 'none' });
        }
        finally {
            setSubmitting(false);
        }
    };
    if (loading) {
        return (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.Text, { style: { padding: '40rpx', color: '#9ca3af' }, children: "\u52A0\u8F7D\u4E2D\u2026" }) });
    }
    if (!pos) {
        return (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.Text, { style: { padding: '40rpx', color: '#9ca3af' }, children: "\u5C97\u4F4D\u4E0D\u5B58\u5728" }) });
    }
    const isOpen = pos.status === 'open';
    const isFull = ((_a = pos.headcount) !== null && _a !== void 0 ? _a : 0) > 0 && ((_b = pos.hired_count) !== null && _b !== void 0 ? _b : 0) >= ((_c = pos.headcount) !== null && _c !== void 0 ? _c : 0);
    const canApply = isOpen && !isFull;
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.heroCard, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroTitle, children: pos.title }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroMeta, children: [pos.position_type === 'temporary' ? '临时岗' : '固定岗', pos.department_name && ` · ${pos.department_name}`, pos.academic_year && ` · ${pos.academic_year} 学年`] }), (pos.salary_amount || pos.hourly_rate) && ((0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroSalary, children: ["\u00A5", Number(pos.salary_amount || pos.hourly_rate).toFixed(2), " / ", SALARY_UNIT_LABEL[pos.salary_unit || 'hour'] || '时'] }))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u5C97\u4F4D\u63CF\u8FF0" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionBody, children: pos.description })] }), pos.requirements && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u4EFB\u804C\u8981\u6C42" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionBody, children: pos.requirements })] })), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u57FA\u672C\u4FE1\u606F" }), pos.campus && (0, jsx_runtime_1.jsx)(FieldRow, { label: "\u6821\u533A", value: pos.campus }), pos.work_location && (0, jsx_runtime_1.jsx)(FieldRow, { label: "\u5DE5\u4F5C\u5730\u70B9", value: pos.work_location }), pos.weekly_hours != null && (0, jsx_runtime_1.jsx)(FieldRow, { label: "\u5468\u5DE5\u65F6", value: `${pos.weekly_hours} 小时` }), (0, jsx_runtime_1.jsx)(FieldRow, { label: "\u62DB\u8058\u4EBA\u6570", value: `${(_d = pos.hired_count) !== null && _d !== void 0 ? _d : 0} / ${(_e = pos.headcount) !== null && _e !== void 0 ? _e : '?'}` }), pos.application_deadline && ((0, jsx_runtime_1.jsx)(FieldRow, { label: "\u7533\u8BF7\u622A\u6B62", value: pos.application_deadline.slice(0, 16).replace('T', ' ') }))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.applyBar, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.aiBtn, onClick: () => !drafting && handleAiDraft(), children: drafting ? '起草中…' : 'AI 帮我写' }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.applyBtn} ${!canApply ? index_module_css_1.default.applyBtnDisabled : ''}`, onClick: () => canApply && setApplyOpen(true), children: !isOpen ? '已关闭' : isFull ? '已招满' : '立即申请' })] }), applyOpen && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.modalMask, onClick: () => setApplyOpen(false), children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.modal, onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.modalTitle, children: ["\u7533\u8BF7\uFF1A", pos.title] }), (0, jsx_runtime_1.jsx)(components_1.Textarea, { className: index_module_css_1.default.textarea, value: intro, onInput: (e) => setIntro(e.detail.value), placeholder: "\u8BF7\u7B80\u8FF0\u4F60\u4E3A\u4EC0\u4E48\u9002\u5408\u8FD9\u4E2A\u5C97\u4F4D\uFF08\u81F3\u5C11 10 \u5B57\uFF09", maxlength: 2000 }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.modalActions, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.modalCancel, onClick: () => setApplyOpen(false), children: "\u53D6\u6D88" }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.modalSubmit, onClick: () => !submitting && handleApply(), children: submitting ? '提交中…' : '提交申请' })] })] }) }))] }));
}
function FieldRow({ label, value }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.fieldRow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.fieldLabel, children: label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.fieldValue, children: value })] }));
}
//# sourceMappingURL=index.js.map