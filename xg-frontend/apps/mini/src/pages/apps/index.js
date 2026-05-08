"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AppsPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../../utils/icons");
const index_module_css_1 = __importDefault(require("./index.module.css"));
function buildApps(roles) {
    const isStaff = roles.some((r) => ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'].includes(r));
    const leave = isStaff
        ? {
            key: 'leave-manage',
            icon: 'edit',
            title: '请假审批',
            hint: '处理学生待审请假',
            path: '/pages/leave/approval/index',
            tone: 'peach',
            size: 'large',
        }
        : {
            key: 'leave-mine',
            icon: 'edit',
            title: '我的请假',
            hint: '提交请假、销假，查看进度',
            path: '/pages/leave/list/index',
            tone: 'peach',
            size: 'large',
        };
    const items = [
        leave,
        {
            key: 'workstudy',
            icon: 'briefcase',
            title: '勤工助学',
            hint: '岗位与工资',
            path: '/pages/workStudy/index',
            tone: 'blue',
            size: 'small',
        },
    ];
    // 班级请假 仅辅导员可见——区别于「请假审批」（仅看我作为审批人的待办），
    // 这里是班级全量视图，包含强制销假入口
    if (isStaff) {
        items.push({
            key: 'leave-class',
            icon: 'file-text',
            title: '班级请假',
            hint: '全班动态 + 强制销假',
            path: '/pages/leave/class/index',
            tone: 'cream',
            size: 'small',
        });
    }
    // 我的勤工 仅对学生展示——辅导员 / 院长 不参与申请，藏起来减少噪音
    if (!isStaff) {
        items.push({
            key: 'my-workstudy',
            icon: 'wallet',
            title: '我的勤工',
            hint: '申请进度与薪资',
            path: '/pages/myWorkStudy/index',
            tone: 'cream',
            size: 'small',
        });
    }
    items.push({
        key: 'notifications',
        icon: 'bell',
        title: '通知',
        hint: '消息与系统提醒',
        path: '/pages/notifications/index',
        tone: 'cream',
        size: 'small',
    }, {
        key: 'schedule',
        icon: 'calendar',
        title: '我的课表',
        hint: '即将上线',
        path: '/pages/schedule/index',
        tone: 'warn',
        size: 'small',
    });
    return items;
}
function AppsPage() {
    var _a;
    const [user, setUser] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const raw = taro_1.default.getStorageSync('user');
        if (raw)
            setUser(raw);
    }, []);
    const apps = buildApps((_a = user === null || user === void 0 ? void 0 : user.roleCodes) !== null && _a !== void 0 ? _a : []);
    const handleTap = (path) => {
        taro_1.default.navigateTo({ url: path }).catch(() => {
            taro_1.default.showToast({ title: '该模块即将上线', icon: 'none' });
        });
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u5E94\u7528" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubtitle, children: "\u5E38\u7528\u529F\u80FD\u96C6\u4E2D\u5728\u8FD9\u91CC" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.grid, children: apps.map((app) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.cell} ${index_module_css_1.default[`tone_${app.tone}`]} ${app.size === 'large' ? index_module_css_1.default.cellLarge : index_module_css_1.default.cellSmall} tap-min`, onClick: () => handleTap(app.path), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.iconWrap, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: app.icon, color: "currentColor", size: 42 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.text, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.title, children: app.title }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.hint, children: app.hint })] })] }, app.key))) })] }));
}
//# sourceMappingURL=index.js.map