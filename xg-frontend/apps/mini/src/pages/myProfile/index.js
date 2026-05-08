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
exports.default = MyProfilePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const student_1 = require("../../api/student");
const leave_1 = require("../../api/leave");
const index_module_css_1 = __importDefault(require("./index.module.css"));
function nonEmpty(v) {
    if (v == null || v === '')
        return '';
    if (typeof v === 'object')
        return JSON.stringify(v);
    return String(v);
}
function buildBasicFields(s) {
    var _a;
    return [
        { label: '学号', value: s.student_no || '—' },
        { label: '姓名', value: s.name || '—' },
        { label: '性别', value: s.gender === 'male' ? '男' : s.gender === 'female' ? '女' : (s.gender || '—') },
        { label: '学院', value: s.college || '—' },
        { label: '专业', value: s.major || '—' },
        { label: '班级', value: s.class_name || '—' },
        { label: '年级', value: s.grade || '—' },
        { label: '学历', value: s.education_level || '—' },
        { label: '入学时间', value: ((_a = s.enrollment_date) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) || '—' },
    ].filter((f) => f.value !== '');
}
function buildContactFields(s, ext) {
    // phone / email 优先用 student 表的（更权威）；extended_info 里的"紧急联系人"
    // 来自学生自助登记，与之分开展示，便于辅导员核对
    const out = [];
    if (s.phone)
        out.push({ label: '手机', value: s.phone });
    if (s.email)
        out.push({ label: '邮箱', value: s.email });
    const econ = nonEmpty(ext.emergency_contact_name);
    const ephone = nonEmpty(ext.emergency_contact);
    if (econ)
        out.push({ label: '紧急联系人', value: econ });
    if (ephone)
        out.push({ label: '紧急联系电话', value: ephone });
    return out;
}
/**
 * 渲染 extended_info 里所有"未在 contact 段被消费"的剩余字段。
 * 标签做了一份 best-effort 翻译，没匹配上就显示原 key。
 */
const EXT_LABEL_MAP = {
    hometown: '籍贯',
    ethnicity: '民族',
    political_status: '政治面貌',
    dormitory: '宿舍',
    bank_account: '银行账号',
    id_card_no: '身份证号',
    bed_no: '床位号',
};
function buildOtherExt(ext) {
    var _a;
    const skip = new Set(['emergency_contact', 'emergency_contact_name']);
    const out = [];
    for (const [k, v] of Object.entries(ext)) {
        if (skip.has(k))
            continue;
        const value = nonEmpty(v);
        if (!value)
            continue;
        out.push({ label: (_a = EXT_LABEL_MAP[k]) !== null && _a !== void 0 ? _a : k, value });
    }
    return out;
}
function MyProfilePage() {
    var _a;
    const [student, setStudent] = (0, react_1.useState)(null);
    const [ext, setExt] = (0, react_1.useState)({});
    const [recentLeaves, setRecentLeaves] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [notStudent, setNotStudent] = (0, react_1.useState)(false);
    const load = async () => {
        var _a;
        setLoading(true);
        try {
            const [s, e, leaves] = await Promise.all([
                (0, student_1.getMyStudent)().catch(() => null),
                (0, student_1.getMyExtendedInfo)().catch(() => ({})),
                (0, leave_1.listMyLeaves)({ page: 1, size: 5 }).catch(() => ({ data: [], total: 0 })),
            ]);
            if (!s) {
                setNotStudent(true);
            }
            else {
                setStudent(s);
                setExt(e !== null && e !== void 0 ? e : {});
                setRecentLeaves((_a = leaves.data) !== null && _a !== void 0 ? _a : []);
            }
        }
        catch (err) {
            taro_1.default.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    };
    (0, react_1.useEffect)(() => { load(); }, []);
    (0, taro_1.useDidShow)(() => { load(); });
    if (loading) {
        return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" }) }));
    }
    if (notStudent) {
        return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.empty, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.emptyText, children: "\u5F53\u524D\u8D26\u53F7\u4E0D\u662F\u5B66\u751F\u8EAB\u4EFD" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.emptySub, children: "\u4EC5\u5B66\u751F\u53EF\u67E5\u770B\u4E2A\u4EBA\u6863\u6848" })] }) }));
    }
    if (!student) {
        return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u672A\u627E\u5230\u6863\u6848" }) }));
    }
    const basicFields = buildBasicFields(student);
    const contactFields = buildContactFields(student, ext);
    const otherExt = buildOtherExt(ext);
    const statusZh = (_a = student_1.STATUS_LABELS[student.status]) !== null && _a !== void 0 ? _a : student.status;
    const statusTone = student.status === 'active' ? 'ok'
        : student.status === 'suspended' ? 'warn'
            : student.status === 'withdrawn' ? 'danger'
                : 'muted';
    return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsxs)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.scroll, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroEyebrow, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: student.student_no }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroName} display`, children: student.name }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.heroMetaRow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPill} ${index_module_css_1.default[`tone_${statusTone}`]}`, children: statusZh }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSub, children: [student.college, student.class_name].filter(Boolean).join(' · ') })] })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u57FA\u672C\u4FE1\u606F" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.card, children: basicFields.map((f, i) => ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [i > 0 && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: f.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowValue, children: f.value })] })] }, f.label))) }), contactFields.length > 0 && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u8054\u7CFB\u65B9\u5F0F" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.card, children: contactFields.map((f, i) => ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [i > 0 && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: f.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowValue, children: f.value })] })] }, f.label))) })] })), otherExt.length > 0 && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u9644\u52A0\u4FE1\u606F" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.card, children: otherExt.map((f, i) => ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [i > 0 && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: f.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowValue, children: f.value })] })] }, f.label))) })] })), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u8FD1\u671F\u8BF7\u5047" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionDate, children: recentLeaves.length > 0 ? `近 ${recentLeaves.length} 条` : '暂无' })] }), recentLeaves.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.emptySub, children: "\u6682\u65E0\u8BF7\u5047\u8BB0\u5F55" }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.leaveList, children: recentLeaves.map((l) => {
                        var _a;
                        const tone = leave_1.LEAVE_STATUS_TONES[l.status];
                        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.leaveRow, onClick: () => taro_1.default.navigateTo({ url: `/pages/leave/detail/index?id=${l.id}` }), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.leaveMain, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.leaveTitle, children: [l.leave_type_name || '请假', (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.leaveDays, children: [" \u00B7 ", l.duration_days, "\u5929"] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.leaveDate} num`, children: ((_a = l.start_time) !== null && _a !== void 0 ? _a : '').slice(0, 10) })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.leaveStatus} ${index_module_css_1.default[`tone_${tone}`]}`, children: leave_1.LEAVE_STATUS_LABELS[l.status] })] }, l.id));
                    }) })), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.bottomSpace })] }) }));
}
//# sourceMappingURL=index.js.map