"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ProfilePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../../utils/icons");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 个人中心 — Notion × Profile archetype。
 *
 * Phase A：身份卡 + 切换身份占位 + 退出。退出已可用；切换身份在 Phase B
 * 接入（用户多角色时弹 actionSheet 切换 roleCode 并回写 storage）。
 */
const ROLE_LABELS = {
    student: '学生',
    counselor: '辅导员',
    college_admin: '院系管理员',
    dean: '院系领导',
    student_affairs_officer: '学工处',
    school_admin: '校级管理员',
    super_admin: '超级管理员',
    employer: '用人单位',
    aid_center_officer: '资助中心',
};
function ProfilePage() {
    var _a, _b, _c, _d;
    const [user, setUser] = (0, react_1.useState)(null);
    // null = 还未读 storage；明确区分"未登录"和"loading"
    const [loaded, setLoaded] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const raw = taro_1.default.getStorageSync('user');
        if (raw)
            setUser(raw);
        setLoaded(true);
    }, []);
    const isLoggedIn = !!user;
    const roles = (_a = user === null || user === void 0 ? void 0 : user.roleCodes) !== null && _a !== void 0 ? _a : [];
    const primaryRoleZh = roles[0] ? (_b = ROLE_LABELS[roles[0]]) !== null && _b !== void 0 ? _b : roles[0] : '';
    const canSwitch = roles.length > 1;
    // 我的档案 仅学生可见——staff 调 /students-me 会拿 null（且对辅导员而言这条入口无意义）
    const isStudent = roles.includes('student');
    const handleSwitchRole = () => {
        if (!canSwitch)
            return;
        taro_1.default.showToast({ title: '切换身份功能开发中', icon: 'none' });
    };
    const handleLogout = () => {
        taro_1.default.showModal({
            title: '退出登录',
            content: '确定退出当前账号？',
            confirmText: '退出',
            cancelText: '取消',
            success: (res) => {
                if (!res.confirm)
                    return;
                taro_1.default.removeStorageSync('token');
                taro_1.default.removeStorageSync('refreshToken');
                taro_1.default.removeStorageSync('user');
                taro_1.default.removeStorageSync('userId');
                taro_1.default.reLaunch({ url: '/pages/login/index' });
            },
        });
    };
    const handleLogin = () => {
        taro_1.default.reLaunch({ url: '/pages/login/index' });
    };
    /** 取头像首字符。中文姓名取第一字，否则取 username 首字大写。 */
    const initial = (user === null || user === void 0 ? void 0 : user.realName)
        ? user.realName.slice(0, 1)
        : (user === null || user === void 0 ? void 0 : user.username)
            ? user.username.slice(0, 1).toUpperCase()
            : '?';
    // 未登录态：身份卡占位 + 唯一 CTA「前往登录」，避免出现"切换身份/退出登录"
    // 这种对未登录者无意义的入口；同时不把"未知角色 / 仅有一个角色"这种
    // 误导文案露出去。
    if (loaded && !isLoggedIn) {
        return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.hero, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u4E2A\u4EBA\u4E2D\u5FC3" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.identityCard, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.avatar, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.avatarText, children: "?" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.identityText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.identityName, children: "\u672A\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.identityRole, children: "\u767B\u5F55\u540E\u67E5\u770B\u4E2A\u4EBA\u4FE1\u606F\u548C\u5F85\u529E" })] })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.list, children: (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.row} tap-min`, onClick: handleLogin, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rowIcon} ${index_module_css_1.default.tone_accent}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "user", color: "currentColor", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rowText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowTitle, children: "\u524D\u5F80\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowHint, children: "\u4F7F\u7528\u5B66\u5DE5\u53F7 / \u5DE5\u53F7\u767B\u5F55" })] }), (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "chevron-right", color: "var(--fg-4)", size: 24 })] }) })] }));
    }
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.hero, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroTitle} display`, children: "\u4E2A\u4EBA\u4E2D\u5FC3" }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.identityCard, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.avatar, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.avatarText, children: initial }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.identityText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.identityName, children: (_d = (_c = user === null || user === void 0 ? void 0 : user.realName) !== null && _c !== void 0 ? _c : user === null || user === void 0 ? void 0 : user.username) !== null && _d !== void 0 ? _d : '' }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.identityRole, children: [primaryRoleZh, canSwitch && ((0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.roleMore, children: [" \u00B7 \u5171 ", roles.length, " \u4E2A\u89D2\u8272"] }))] })] })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.list, children: [isStudent && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.row} tap-min`, onClick: () => taro_1.default.navigateTo({ url: '/pages/myProfile/index' }), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rowIcon} ${index_module_css_1.default.tone_accent}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "file-text", color: "currentColor", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rowText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowTitle, children: "\u6211\u7684\u6863\u6848" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowHint, children: "\u57FA\u672C\u4FE1\u606F \u00B7 \u8054\u7CFB\u65B9\u5F0F \u00B7 \u8FD1\u671F\u8BF7\u5047" })] }), (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "chevron-right", color: "var(--fg-4)", size: 24 })] })), canSwitch && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.row} tap-min`, onClick: handleSwitchRole, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rowIcon} ${index_module_css_1.default.tone_accent}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "user", color: "currentColor", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rowText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowTitle, children: "\u5207\u6362\u8EAB\u4EFD" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.rowHint, children: ["\u5728 ", roles.length, " \u4E2A\u89D2\u8272\u4E4B\u95F4\u5207\u6362"] })] }), (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "chevron-right", color: "var(--fg-4)", size: 24 })] })), (0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.row} tap-min`, onClick: handleLogout, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.rowIcon} ${index_module_css_1.default.tone_danger}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "log-out", color: "currentColor", size: 28 }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.rowText, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowTitle, children: "\u9000\u51FA\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.rowHint, children: "\u6E05\u9664\u672C\u5730\u767B\u5F55\u6001\uFF0C\u56DE\u5230\u767B\u5F55\u9875" })] }), (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "chevron-right", color: "var(--fg-4)", size: 24 })] })] })] }));
}
//# sourceMappingURL=index.js.map