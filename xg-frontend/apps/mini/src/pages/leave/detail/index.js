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
exports.default = LeaveDetailPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importStar(require("@tarojs/taro"));
const leave_1 = require("../../../api/leave");
const workflow_1 = require("../../../api/workflow");
const ai_1 = require("../../../api/ai");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 请假详情 — Apple 玻璃感 × Detail archetype。
 *
 * 双角色复用：
 *   · 学生（无 taskId 参数）：基本信息 / 附加表单 / 定位 + 撤回 / 销假
 *   · 审批人（带 taskId 参数）：同样信息 + 批准 / 驳回（含 AI 改写底栏）
 */
function formatDateTime(s) {
    if (!s)
        return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime()))
        return s;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
function formatExtraValue(v) {
    if (v == null || v === '')
        return '—';
    if (Array.isArray(v))
        return v.length ? v.join('、') : '—';
    if (typeof v === 'object')
        return JSON.stringify(v);
    return String(v);
}
function LeaveDetailPage() {
    var _a, _b, _c, _d, _e;
    const router = (0, taro_1.useRouter)();
    const id = String((_a = router.params.id) !== null && _a !== void 0 ? _a : '');
    const taskId = String((_b = router.params.taskId) !== null && _b !== void 0 ? _b : '');
    const isApprover = !!taskId;
    const [record, setRecord] = (0, react_1.useState)(null);
    const [typeConfig, setTypeConfig] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [busy, setBusy] = (0, react_1.useState)(false);
    // ── 驳回底栏状态 ─────────────────────────────────────
    const [rejectOpen, setRejectOpen] = (0, react_1.useState)(false);
    const [rejectComment, setRejectComment] = (0, react_1.useState)('');
    // 改写前原稿，方便一键撤销；为 null 表示从未改写或已手动编辑（提交新稿）
    const [polishOriginal, setPolishOriginal] = (0, react_1.useState)(null);
    const [polishing, setPolishing] = (0, react_1.useState)(false);
    // ── 人工销假申请底栏(GPS 不命中时的兜底通道)─────
    const [manualOpen, setManualOpen] = (0, react_1.useState)(false);
    const [manualReason, setManualReason] = (0, react_1.useState)('');
    // ── 影响课程（仅审批人模式可见）────────────────────
    const [impact, setImpact] = (0, react_1.useState)(null);
    const [impactExpanded, setImpactExpanded] = (0, react_1.useState)(false);
    const load = (0, react_1.useCallback)(async () => {
        var _a;
        if (!id)
            return;
        setLoading(true);
        try {
            // impact 仅审批人需要：背景拉，不阻塞详情主体；失败静默（zero 视图也行）
            const impactP = isApprover
                ? (0, leave_1.getLeaveImpact)(id).catch(() => null)
                : Promise.resolve(null);
            const [detail, types, impactRes] = await Promise.all([
                (0, leave_1.getLeaveDetail)(id),
                (0, leave_1.getLeaveTypes)().catch(() => []),
                impactP,
            ]);
            setRecord(detail);
            const cfg = (_a = types.find((t) => t.code === detail.leave_type_code)) !== null && _a !== void 0 ? _a : null;
            setTypeConfig(cfg);
            if (impactRes)
                setImpact(impactRes);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
        }
        finally {
            setLoading(false);
        }
    }, [id, isApprover]);
    (0, react_1.useEffect)(() => {
        load();
    }, [load]);
    const onWithdraw = () => {
        if (!record)
            return;
        taro_1.default.showModal({
            title: '确认撤回',
            content: '撤回后该申请将作废，可重新提交。',
            confirmText: '确定撤回',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusy(true);
                try {
                    await (0, leave_1.withdrawLeave)(record.id);
                    taro_1.default.showToast({ title: '已撤回', icon: 'success' });
                    setTimeout(() => taro_1.default.navigateBack(), 600);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '撤回失败', icon: 'none' });
                    setBusy(false);
                }
            },
        });
    };
    /**
     * 销假主入口(改造后):学生点「我已返校」→ GPS 命中即销;不命中
     * 弹页给两条路 — 重新定位 / 申请人工销假。原来的 leave_return workflow
     * 已废弃,不再有"销假表单字段"这种概念。
     */
    const onCancel = () => {
        if (!record)
            return;
        taro_1.default.showModal({
            title: '我已返校',
            content: '将根据当前 GPS 自动判断是否在校园内,在校园内立即销假。',
            confirmText: '获取定位',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                await trySubmitByLocation();
            },
        });
    };
    const captureLocation = () => new Promise((resolve) => {
        taro_1.default.getLocation({
            type: 'gcj02',
            success: (r) => resolve({
                latitude: r.latitude,
                longitude: r.longitude,
                capturedAt: new Date().toISOString(),
            }),
            fail: () => resolve(null),
        });
    });
    /** GPS 销假主链路:拉位置 → 调 by-location → 命中即 toast / 不命中弹拒绝页 */
    const trySubmitByLocation = async () => {
        if (!record)
            return;
        setBusy(true);
        try {
            const loc = await captureLocation();
            if (!loc) {
                taro_1.default.showToast({ title: '未获取到 GPS,请检查定位权限', icon: 'none' });
                return;
            }
            const res = await (0, leave_1.returnByLocation)(record.id, loc.latitude, loc.longitude, loc.capturedAt);
            if (res.inFence) {
                taro_1.default.showToast({ title: '销假成功', icon: 'success' });
                await load();
            }
            else {
                showOutOfFenceModal(res.distanceMeters, res.radiusMeters);
            }
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '销假失败', icon: 'none' });
        }
        finally {
            setBusy(false);
        }
    };
    /** GPS 不在校园内 — 给学生两条路:重新定位 或 申请人工销假。 */
    const showOutOfFenceModal = (distM, radiusM) => {
        taro_1.default.showModal({
            title: '不在校园内',
            content: `距校园中心 ${distM.toFixed(0)} 米(围栏 ${radiusM} 米)。可以「重新定位」再试一次,或「申请人工销假」由辅导员审核。`,
            confirmText: '重新定位',
            cancelText: '人工销假',
            // 微信将 cancel 渲染在左,confirm 在右 — 主操作给重新定位
            success: (r) => {
                if (r.confirm) {
                    trySubmitByLocation();
                }
                else if (r.cancel) {
                    setManualReason('');
                    setManualOpen(true);
                }
            },
        });
    };
    /** 提交人工销假申请(GPS 兜底通道)。 */
    const submitManualApply = async () => {
        if (!record)
            return;
        const reason = manualReason.trim();
        if (!reason) {
            taro_1.default.showToast({ title: '请填写人工销假理由', icon: 'none' });
            return;
        }
        setBusy(true);
        try {
            // P0 暂不带附件;学生需要附件可以让辅导员线下沟通,后续接 MinIO 上传时再补
            await (0, leave_1.applyManualReturn)(record.id, reason, []);
            taro_1.default.showToast({ title: '已提交,等辅导员审', icon: 'success' });
            setManualOpen(false);
            await load();
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '提交失败', icon: 'none' });
        }
        finally {
            setBusy(false);
        }
    };
    const openLocation = (lat, lng) => {
        taro_1.default.openLocation({ latitude: lat, longitude: lng, scale: 16 }).catch(() => {
            taro_1.default.showToast({ title: '无法打开地图', icon: 'none' });
        });
    };
    // ── 审批人动作 ───────────────────────────────────────
    const onApprove = () => {
        if (!taskId)
            return;
        taro_1.default.showModal({
            title: '批准请假',
            content: '默认批注「同意」，确认后将通过下一节点。',
            confirmText: '确认批准',
            cancelText: '取消',
            success: async (r) => {
                if (!r.confirm)
                    return;
                setBusy(true);
                try {
                    await (0, workflow_1.approveTask)(taskId, '同意');
                    taro_1.default.showToast({ title: '已批准', icon: 'success' });
                    setTimeout(() => taro_1.default.navigateBack(), 600);
                }
                catch (e) {
                    taro_1.default.showToast({ title: e instanceof Error ? e.message : '批准失败', icon: 'none' });
                    setBusy(false);
                }
            },
        });
    };
    const openRejectSheet = () => {
        setRejectComment('');
        setPolishOriginal(null);
        setRejectOpen(true);
    };
    const closeRejectSheet = () => {
        if (busy || polishing)
            return;
        setRejectOpen(false);
    };
    const onPolish = async () => {
        var _a, _b, _c;
        const draft = rejectComment.trim();
        if (!draft) {
            taro_1.default.showToast({ title: '请先写一句草稿', icon: 'none' });
            return;
        }
        setPolishing(true);
        try {
            const ctx = record
                ? [
                    `学生：${(_a = record.student_name) !== null && _a !== void 0 ? _a : ''}`,
                    `请假类型：${(_b = record.leave_type_name) !== null && _b !== void 0 ? _b : '请假'}`,
                    `时长：${record.duration_days}天`,
                    record.reason ? `学生写的请假理由：${record.reason}` : '',
                ].filter(Boolean).join('\n')
                : undefined;
            const res = await (0, ai_1.polishRejection)(draft, ctx);
            if (res.error_message) {
                taro_1.default.showToast({ title: 'AI 改写不可用', icon: 'none' });
                return;
            }
            const polished = ((_c = res.polished) !== null && _c !== void 0 ? _c : '').trim();
            if (!polished || polished === draft) {
                taro_1.default.showToast({ title: 'AI 没有给出更好的改写', icon: 'none' });
                return;
            }
            setPolishOriginal(draft);
            setRejectComment(polished);
            taro_1.default.showToast({ title: '已改写，可点撤销恢复', icon: 'none' });
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : 'AI 改写失败', icon: 'none' });
        }
        finally {
            setPolishing(false);
        }
    };
    const onRevertPolish = () => {
        if (polishOriginal == null)
            return;
        setRejectComment(polishOriginal);
        setPolishOriginal(null);
    };
    const onSubmitReject = async () => {
        if (!taskId)
            return;
        const trimmed = rejectComment.trim();
        if (!trimmed) {
            taro_1.default.showToast({ title: '请填写驳回意见', icon: 'none' });
            return;
        }
        setBusy(true);
        try {
            await (0, workflow_1.rejectTask)(taskId, trimmed);
            taro_1.default.showToast({ title: '已驳回', icon: 'success' });
            setRejectOpen(false);
            setTimeout(() => taro_1.default.navigateBack(), 600);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '驳回失败', icon: 'none' });
            setBusy(false);
        }
    };
    if (loading) {
        return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u52A0\u8F7D\u4E2D\u2026" }) }));
    }
    if (!record) {
        return ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.page, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.empty, children: "\u672A\u627E\u5230\u8BE5\u8BF7\u5047\u7533\u8BF7" }) }));
    }
    const tone = leave_1.LEAVE_STATUS_TONES[record.status];
    const formData = (_c = record.form_data) !== null && _c !== void 0 ? _c : {};
    const extraFields = (_d = typeConfig === null || typeConfig === void 0 ? void 0 : typeConfig.extra_fields) !== null && _d !== void 0 ? _d : [];
    const extraEntries = Object.entries(formData).filter(([k]) => k && k !== 'reject_reason');
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.ScrollView, { scrollY: true, className: index_module_css_1.default.scroll, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statusPillLg} ${index_module_css_1.default[`tone_${tone}`]}`, children: leave_1.LEAVE_STATUS_LABELS[record.status] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: record.leave_type_name || '请假' }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroMeta, children: ["\u521B\u5EFA\u4E8E ", (0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: formatDateTime(record.created_at) })] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u5F00\u59CB\u65F6\u95F4" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.rowValue} num`, children: formatDateTime(record.start_time) })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u7ED3\u675F\u65F6\u95F4" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.rowValue} num`, children: formatDateTime(record.end_time) })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u8BF7\u5047\u5929\u6570" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.rowValue, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: record.duration_days }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.unit, children: " \u5929" })] })] })] }), isApprover && impact && impact.total_periods > 0 && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u5F71\u54CD\u8BFE\u7A0B" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.card} ${index_module_css_1.default.impactCard}`, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactTrigger, onClick: () => setImpactExpanded((v) => !v), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactStat, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactNum} num`, children: impact.total_periods }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactNumUnit, children: " \u8282\u8BFE" })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactSep, children: "\u00B7" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactStat, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactNum} num`, children: impact.total_courses }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactNumUnit, children: " \u95E8" })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactSep, children: "\u00B7" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactStat, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactNum} num`, children: impact.total_days }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactNumUnit, children: " \u5929" })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactArrow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactArrowGlyph, children: impactExpanded ? '收起' : '展开' }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactArrowChev, children: impactExpanded ? '∧' : '∨' })] })] }), impactExpanded && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.impactList, children: impact.by_day.map((d) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactDay, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactDayHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactDayDate} num`, children: d.date }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.impactDayMeta, children: ["\u5468", ['日', '一', '二', '三', '四', '五', '六'][d.day_of_week % 7], " \u00B7 \u7B2C ", d.week, " \u5468"] })] }), d.courses.map((c, ci) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactCourse, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.impactCourseDot, style: c.color ? `background:${c.color}` : '' }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.impactCourseText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactCourseName, children: c.course_name }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.impactCourseMeta, children: [c.teacher, c.location].filter(Boolean).join(' · ') })] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.impactCoursePeriod} num`, children: [c.start_period, "-", c.end_period, " \u8282"] })] }, ci)))] }, d.date))) }))] })] })), record.reason && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u8BF7\u5047\u539F\u56E0" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.card, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.bodyText, children: record.reason }) })] })), extraEntries.length > 0 && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u9644\u52A0\u4FE1\u606F" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.card, children: extraEntries.map(([k, v], i) => {
                                    var _a;
                                    const def = extraFields.find((f) => f.field_key === k);
                                    const label = (_a = def === null || def === void 0 ? void 0 : def.field_label) !== null && _a !== void 0 ? _a : k;
                                    return ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [i > 0 && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.row, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowValue, children: formatExtraValue(v) })] })] }, k));
                                }) })] })), record.status === 'rejected' && typeof formData.reject_reason === 'string' && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u9A73\u56DE\u539F\u56E0" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.card} ${index_module_css_1.default.cardDanger}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.bodyText, children: String(formData.reject_reason) }) })] })), (record.apply_latitude != null || record.return_latitude != null) && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionHead, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u63D0\u4EA4\u5B9A\u4F4D" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.card, children: [record.apply_latitude != null && record.apply_longitude != null && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.locRow, onClick: () => openLocation(Number(record.apply_latitude), Number(record.apply_longitude)), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.locText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u7533\u8BF7\u5B9A\u4F4D" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.locCoords} num`, children: [Number(record.apply_latitude).toFixed(4), ", ", Number(record.apply_longitude).toFixed(4)] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.locArrow, children: "\u203A" })] })), record.return_latitude != null && record.return_longitude != null && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [record.apply_latitude != null && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.divider }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.locRow, onClick: () => openLocation(Number(record.return_latitude), Number(record.return_longitude)), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.locText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowLabel, children: "\u9500\u5047\u5B9A\u4F4D" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: `${index_module_css_1.default.locCoords} num`, children: [Number(record.return_latitude).toFixed(4), ", ", Number(record.return_longitude).toFixed(4)] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.locArrow, children: "\u203A" })] })] }))] })] })), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.bottomSpace })] }), isApprover && record.status === 'pending' && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.actionBar, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.barBtn} ${index_module_css_1.default.barBtnGhost} tap-min`, onClick: busy ? undefined : openRejectSheet, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.barBtnLabel, children: "\u9A73\u56DE" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.barBtn} ${index_module_css_1.default.barBtnPrimary} tap-min`, onClick: busy ? undefined : onApprove, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.barBtnLabel, children: busy ? '处理中…' : '批准' }) })] })), !isApprover && (record.status === 'pending' || record.status === 'approved') && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.actionBar, children: [record.status === 'pending' && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.barBtn} ${index_module_css_1.default.barBtnGhost} tap-min`, onClick: busy ? undefined : onWithdraw, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.barBtnLabel, children: busy ? '处理中…' : '撤回申请' }) })), record.status === 'approved' && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.barBtn} ${index_module_css_1.default.barBtnPrimary} tap-min`, onClick: busy ? undefined : onCancel, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.barBtnLabel, children: busy ? '处理中…' : '申请销假' }) }))] })), manualOpen && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.rejectMask, onClick: () => !busy && setManualOpen(false), children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectSheet, onClick: (e) => e.stopPropagation(), catchMove: true, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.rejectHandle }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectHeader, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectTitle, children: "\u7533\u8BF7\u4EBA\u5DE5\u9500\u5047" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectSubtitle, children: "\u8BF4\u660E\u4F60\u76EE\u524D\u7684\u60C5\u51B5,\u8F85\u5BFC\u5458\u770B\u540E\u51B3\u5B9A\u662F\u5426\u9500\u5047" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.returnFields, children: (0, jsx_runtime_1.jsx)(components_1.Textarea, { className: index_module_css_1.default.returnInput, value: manualReason, onInput: (e) => setManualReason(e.detail.value), placeholder: "\u4F8B:\u5728\u533B\u9662\u590D\u8BCA\u672A\u80FD\u8D76\u56DE / \u9AD8\u94C1\u665A\u70B9\u6EDE\u7559 / \u6821\u5916\u5BBF\u820D\u5DF2\u5C01\u95ED", maxlength: 1000, autoHeight: true }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectActions, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rejectAction} ${index_module_css_1.default.rejectActionGhost} tap-min`, onClick: () => !busy && setManualOpen(false), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectActionLabel, children: "\u53D6\u6D88" }) }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rejectAction} ${index_module_css_1.default.returnActionPrimary} tap-min`, onClick: busy ? undefined : submitManualApply, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectActionLabelDanger, children: busy ? '提交中…' : '提交申请' }) })] })] }) })), rejectOpen && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.rejectMask, onClick: closeRejectSheet, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectSheet, onClick: (e) => e.stopPropagation(), catchMove: true, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.rejectHandle }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectHeader, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.rejectTitle, children: ["\u9A73\u56DE ", (_e = record.student_name) !== null && _e !== void 0 ? _e : '', " \u7684\u8BF7\u5047"] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectSubtitle, children: "\u610F\u89C1\u5B66\u751F\u53EF\u89C1\uFF0C\u5148\u5199\u4E00\u53E5\u8349\u7A3F\u53EF\u70B9 AI \u6539\u5199" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.rejectInputWrap, children: (0, jsx_runtime_1.jsx)(components_1.Textarea, { className: index_module_css_1.default.rejectInput, value: rejectComment, onInput: (e) => {
                                    setRejectComment(e.detail.value);
                                    if (polishOriginal != null)
                                        setPolishOriginal(null);
                                }, placeholder: '\u4F8B\u5982"\u65F6\u95F4\u4E0D\u5BF9"\uFF0CAI \u4F1A\u6539\u6210\u5305\u542B\u539F\u56E0\u548C\u5EFA\u8BAE\u7684\u5B8C\u6574\u7248\u672C', maxlength: 1000, autoHeight: true, disableDefaultPadding: true }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rejectActions, children: [polishOriginal != null ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rejectAction} ${index_module_css_1.default.rejectActionGhost} tap-min`, onClick: onRevertPolish, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectActionLabel, children: "\u64A4\u9500\u6539\u5199" }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rejectAction} ${index_module_css_1.default.rejectActionGhost} tap-min`, onClick: polishing ? undefined : onPolish, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectActionLabel, children: polishing ? 'AI 改写中…' : 'AI 改写' }) })), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rejectAction} ${index_module_css_1.default.rejectActionDanger} tap-min`, onClick: busy ? undefined : onSubmitReject, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rejectActionLabelDanger, children: busy ? '提交中…' : '确认驳回' }) })] })] }) }))] }));
}
//# sourceMappingURL=index.js.map