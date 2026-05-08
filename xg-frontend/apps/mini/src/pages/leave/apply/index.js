"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ApplyLeavePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const leave_1 = require("../../../api/leave");
const index_module_css_1 = __importDefault(require("./index.module.css"));
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function combineDateTime(date, time) {
    if (!date)
        return null;
    const [yy, mm, dd] = date.split('-').map(Number);
    const [h = 0, m = 0] = (time || '00:00').split(':').map(Number);
    const d = new Date(yy, (mm !== null && mm !== void 0 ? mm : 1) - 1, dd !== null && dd !== void 0 ? dd : 1, h, m, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}
function ApplyLeavePage() {
    var _a, _b;
    const [types, setTypes] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [submitting, setSubmitting] = (0, react_1.useState)(false);
    const initial = todayISO();
    const [form, setForm] = (0, react_1.useState)({
        leave_type_code: '',
        start_date: initial,
        start_time: '08:00',
        end_date: initial,
        end_time: '18:00',
        reason: '',
        extra: {},
    });
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        // AI 路径预填（store dispatchAction 写入 storage 后跳到这里读 + 清）
        // 字段：leave_type / start_date / end_date / reason / reason_category
        const prefill = taro_1.default.getStorageSync('_leave_apply_prefill');
        if (prefill && typeof prefill === 'object') {
            taro_1.default.removeStorageSync('_leave_apply_prefill');
            const lt = typeof prefill.leave_type === 'string' ? prefill.leave_type : undefined;
            const sd = typeof prefill.start_date === 'string' ? prefill.start_date : undefined;
            const ed = typeof prefill.end_date === 'string' ? prefill.end_date : undefined;
            const rs = typeof prefill.reason === 'string' ? prefill.reason : undefined;
            setForm((p) => {
                var _a;
                return (Object.assign(Object.assign({}, p), { leave_type_code: lt !== null && lt !== void 0 ? lt : p.leave_type_code, start_date: sd !== null && sd !== void 0 ? sd : p.start_date, end_date: (_a = ed !== null && ed !== void 0 ? ed : sd) !== null && _a !== void 0 ? _a : p.end_date, reason: rs !== null && rs !== void 0 ? rs : p.reason }));
            });
        }
        setLoading(true);
        (0, leave_1.getLeaveTypes)()
            .then((res) => {
            if (cancelled)
                return;
            const enabled = res.filter((t) => t.enabled);
            setTypes(enabled);
            // 仅当 prefill 没指定假别时回退到第一个
            setForm((p) => {
                if (p.leave_type_code)
                    return p;
                if (enabled.length > 0)
                    return Object.assign(Object.assign({}, p), { leave_type_code: enabled[0].code });
                return p;
            });
        })
            .catch((e) => {
            taro_1.default.showToast({ title: e.message || '加载假别失败', icon: 'none' });
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);
    const selectedType = (0, react_1.useMemo)(() => { var _a; return (_a = types.find((t) => t.code === form.leave_type_code)) !== null && _a !== void 0 ? _a : null; }, [types, form.leave_type_code]);
    const extraFields = (_a = selectedType === null || selectedType === void 0 ? void 0 : selectedType.extra_fields) !== null && _a !== void 0 ? _a : [];
    // 时长（与后端 ceil(seconds/86400) 同口径）
    const durationDays = (0, react_1.useMemo)(() => {
        const start = combineDateTime(form.start_date, form.start_time);
        const end = combineDateTime(form.end_date, form.end_time);
        if (!start || !end)
            return 0;
        return (0, leave_1.calculateDurationDays)(start.getTime(), end.getTime());
    }, [form.start_date, form.start_time, form.end_date, form.end_time]);
    // 选完起止时间后实时预览会缺的课程。后端按 X-User-Id 取 student_id 算,
    // 非学生 / 无课表 / 学期间隙都返回 zero 视图,UI 按 total_periods 判空态。
    const [impact, setImpact] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const start = combineDateTime(form.start_date, form.start_time);
        const end = combineDateTime(form.end_date, form.end_time);
        if (!start || !end || end.getTime() <= start.getTime()) {
            setImpact(null);
            return;
        }
        let cancelled = false;
        (0, leave_1.previewLeaveImpact)(start.toISOString(), end.toISOString())
            .then((d) => { if (!cancelled)
            setImpact(d); })
            .catch(() => { if (!cancelled)
            setImpact(null); });
        return () => { cancelled = true; };
    }, [form.start_date, form.start_time, form.end_date, form.end_time]);
    const impactCourseNames = (0, react_1.useMemo)(() => {
        if (!impact)
            return [];
        const seen = new Set();
        for (const d of impact.by_day) {
            for (const c of d.courses)
                if (c.course_name)
                    seen.add(c.course_name);
        }
        return Array.from(seen);
    }, [impact]);
    const setField = (key, value) => {
        setForm((p) => (Object.assign(Object.assign({}, p), { [key]: value })));
    };
    const setExtra = (key, value) => {
        setForm((p) => (Object.assign(Object.assign({}, p), { extra: Object.assign(Object.assign({}, p.extra), { [key]: value }) })));
    };
    const onSelectType = (e) => {
        const idx = Number(e.detail.value);
        const t = types[idx];
        if (!t)
            return;
        // 切换假别时，清空 extra（避免上一假别字段串入）
        setForm((p) => (Object.assign(Object.assign({}, p), { leave_type_code: t.code, extra: {} })));
    };
    const validate = () => {
        if (!form.leave_type_code)
            return '请选择假别';
        const start = combineDateTime(form.start_date, form.start_time);
        const end = combineDateTime(form.end_date, form.end_time);
        if (!start || !end)
            return '请选择请假时间';
        if (end.getTime() <= start.getTime())
            return '结束时间必须晚于开始时间';
        if (durationDays > 30)
            return '请假时长不得超过 30 天';
        if (!form.reason.trim())
            return '请填写请假原因';
        for (const f of extraFields) {
            if (f.required) {
                const v = form.extra[f.field_key];
                if (v == null || v === '')
                    return `请填写「${f.field_label}」`;
            }
        }
        return null;
    };
    const getLocation = () => new Promise((resolve) => {
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
    const onSubmit = async () => {
        const err = validate();
        if (err) {
            taro_1.default.showToast({ title: err, icon: 'none' });
            return;
        }
        const start = combineDateTime(form.start_date, form.start_time);
        const end = combineDateTime(form.end_date, form.end_time);
        setSubmitting(true);
        const loc = await getLocation();
        if (!loc) {
            taro_1.default.showToast({ title: '未获取到定位，仍会提交', icon: 'none' });
        }
        try {
            await (0, leave_1.applyLeave)(Object.assign({ leave_type_code: form.leave_type_code, start_time: start.toISOString(), end_time: end.toISOString(), reason: form.reason.trim(), extra_data: Object.assign({}, form.extra) }, (loc
                ? {
                    apply_latitude: loc.latitude,
                    apply_longitude: loc.longitude,
                    apply_location_at: loc.capturedAt,
                }
                : {})));
            taro_1.default.showToast({ title: '已提交', icon: 'success' });
            setTimeout(() => taro_1.default.navigateBack(), 600);
        }
        catch (e) {
            taro_1.default.showToast({ title: e instanceof Error ? e.message : '提交失败', icon: 'none' });
        }
        finally {
            setSubmitting(false);
        }
    };
    const typeIdx = Math.max(0, types.findIndex((t) => t.code === form.leave_type_code));
    const typeRange = types.map((t) => t.name);
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u7533\u8BF7\u8BF7\u5047" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: loading ? '加载中…' : `${types.length} 个假别可选` })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u5047\u522B" }), (0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "selector", range: typeRange, value: typeIdx, onChange: onSelectType, disabled: types.length === 0, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.pickerCell, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.pickerValue, children: (_b = selectedType === null || selectedType === void 0 ? void 0 : selectedType.name) !== null && _b !== void 0 ? _b : (loading ? '加载中…' : '请选择') }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.pickerArrow, children: "\u203A" })] }) })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u5F00\u59CB\u65F6\u95F4" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.dateRow, children: [(0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "date", value: form.start_date, onChange: (e) => setField('start_date', String(e.detail.value)), children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.pickerCell} ${index_module_css_1.default.pickerCellInline}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} num`, children: form.start_date }) }) }), (0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "time", value: form.start_time, onChange: (e) => setField('start_time', String(e.detail.value)), children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.pickerCell} ${index_module_css_1.default.pickerCellInline}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} num`, children: form.start_time }) }) })] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u7ED3\u675F\u65F6\u95F4" }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.dateRow, children: [(0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "date", value: form.end_date, start: form.start_date, onChange: (e) => setField('end_date', String(e.detail.value)), children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.pickerCell} ${index_module_css_1.default.pickerCellInline}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} num`, children: form.end_date }) }) }), (0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "time", value: form.end_time, onChange: (e) => setField('end_time', String(e.detail.value)), children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.pickerCell} ${index_module_css_1.default.pickerCellInline}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} num`, children: form.end_time }) }) })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.durationHint, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.durationLabel, children: "\u8BF7\u5047\u5929\u6570" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.durationValue, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "num", children: durationDays }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.durationUnit, children: " \u5929" })] })] }), impact && impact.total_periods > 0 && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.impactHint, children: (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.impactText, children: ["\u8BE5\u65F6\u6BB5\u4F1A\u7F3A", ' ', (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactNum} num`, children: impact.total_periods }), ' ', "\u8282\u8BFE(", (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.impactNum} num`, children: impact.total_courses }), " \u95E8):", impactCourseNames.slice(0, 3).join('、'), impactCourseNames.length > 3 ? '…' : ''] }) }))] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: "\u8BF7\u5047\u539F\u56E0" }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.textareaCell, children: (0, jsx_runtime_1.jsx)(components_1.Textarea, { className: index_module_css_1.default.textarea, value: form.reason, onInput: (e) => setField('reason', e.detail.value), placeholder: "\u8BF7\u7B80\u8981\u8BF4\u660E\u8BF7\u5047\u539F\u56E0", maxlength: 500, autoHeight: true }) })] }), extraFields.length > 0 && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionGroup, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.sectionGroupLabel, children: [selectedType === null || selectedType === void 0 ? void 0 : selectedType.name, " \u9644\u52A0\u4FE1\u606F"] }), extraFields.map((f) => ((0, jsx_runtime_1.jsx)(ExtraFieldRow, { field: f, value: form.extra[f.field_key], onChange: (v) => setExtra(f.field_key, v) }, f.field_key)))] })), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.actionWrap, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.submit} ${submitting ? index_module_css_1.default.submitBusy : ''} tap-min`, onClick: submitting ? undefined : onSubmit, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.submitLabel, children: submitting ? '提交中…' : '提交申请' }) }) })] }));
}
function ExtraFieldRow({ field, value, onChange, }) {
    var _a, _b, _c, _d, _e, _f;
    const valueStr = value == null ? '' : String(value);
    if (field.field_type === 'select' && field.options && field.options.length > 0) {
        const idx = Math.max(0, field.options.indexOf(valueStr));
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: [field.field_label, field.required && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.required, children: " *" })] }), (0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "selector", range: field.options, value: idx, onChange: (e) => onChange(field.options[Number(e.detail.value)]), children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.pickerCell, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} ${!valueStr ? index_module_css_1.default.pickerPlaceholder : ''}`, children: valueStr || '请选择' }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.pickerArrow, children: "\u203A" })] }) })] }));
    }
    if (field.field_type === 'date') {
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: [field.field_label, field.required && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.required, children: " *" })] }), (0, jsx_runtime_1.jsx)(components_1.Picker, { mode: "date", value: valueStr || todayISO(), onChange: (e) => onChange(String(e.detail.value)), children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.pickerCell, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.pickerValue} num ${!valueStr ? index_module_css_1.default.pickerPlaceholder : ''}`, children: valueStr || '请选择' }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.pickerArrow, children: "\u203A" })] }) })] }));
    }
    if (field.field_type === 'number') {
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: [field.field_label, field.required && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.required, children: " *" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.inputCell, children: (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, type: "digit", value: valueStr, onInput: (e) => onChange(e.detail.value), placeholder: (_a = field.placeholder) !== null && _a !== void 0 ? _a : '请输入' }) })] }));
    }
    if (field.field_type === 'file') {
        // file 字段在 mini P0 不支持上传，给出明确提示，避免静默失败
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: field.field_label }), (0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.inputCell} ${index_module_css_1.default.inputDisabled}`, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.disabledHint, children: "\u8BF7\u524D\u5F80 PC \u7AEF\u4E0A\u4F20\u9644\u4EF6" }) })] }));
    }
    // text 默认
    const isLong = field.field_widget === 'textarea' || ((_b = field.max_length) !== null && _b !== void 0 ? _b : 0) > 80;
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.section, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.sectionLabel, children: [field.field_label, field.required && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.required, children: " *" })] }), isLong ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.textareaCell, children: (0, jsx_runtime_1.jsx)(components_1.Textarea, { className: index_module_css_1.default.textarea, value: valueStr, onInput: (e) => onChange(e.detail.value), placeholder: (_c = field.placeholder) !== null && _c !== void 0 ? _c : '请输入', maxlength: (_d = field.max_length) !== null && _d !== void 0 ? _d : 500, autoHeight: true }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.inputCell, children: (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, value: valueStr, onInput: (e) => onChange(e.detail.value), placeholder: (_e = field.placeholder) !== null && _e !== void 0 ? _e : '请输入', maxlength: (_f = field.max_length) !== null && _f !== void 0 ? _f : 200 }) }))] }));
}
//# sourceMappingURL=index.js.map