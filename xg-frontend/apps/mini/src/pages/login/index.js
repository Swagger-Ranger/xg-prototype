"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Login;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../../utils/icons");
const auth_1 = require("../../api/auth");
const index_module_css_1 = __importDefault(require("./index.module.css"));
const QUICK_USERS = [
    { key: 'student', username: 'stu_zhang', roleZh: '学生', realName: '张晓明', icon: 'user' },
    { key: 'counselor', username: 'counselor_li', roleZh: '辅导员', realName: '李老师', icon: 'edit' },
    { key: 'dean', username: 'dean1', roleZh: '院系领导', realName: '赵院长', icon: 'briefcase' },
    { key: 'officer', username: 'officer1', roleZh: '学工处', realName: '周学工', icon: 'file-text' },
    { key: 'admin', username: 'admin1', roleZh: '校管理员', realName: '王管理', icon: 'gear' },
];
const QUICK_PASSWORD = 'xg@123456';
function Login() {
    const [username, setUsername] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [tenantId, setTenantId] = (0, react_1.useState)('default');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [busyKey, setBusyKey] = (0, react_1.useState)(null);
    /** 通用登录提交。creds 不传则用表单输入。 */
    const submit = async (creds) => {
        var _a, _b, _c;
        const u = (_a = creds === null || creds === void 0 ? void 0 : creds.username) !== null && _a !== void 0 ? _a : username.trim();
        const p = (_b = creds === null || creds === void 0 ? void 0 : creds.password) !== null && _b !== void 0 ? _b : password;
        if (!u || !p) {
            taro_1.default.showToast({ title: '请输入账号和密码', icon: 'none' });
            return;
        }
        try {
            const resp = await (0, auth_1.login)({
                username: u,
                password: p,
                tenantId: tenantId.trim() || 'default',
            });
            taro_1.default.setStorageSync('token', resp.token);
            taro_1.default.setStorageSync('userId', resp.user.id);
            taro_1.default.setStorageSync('tenantId', resp.user.tenantId || tenantId);
            taro_1.default.setStorageSync('user', resp.user);
            taro_1.default.showToast({ title: `已登录 · ${(_c = resp.user.realName) !== null && _c !== void 0 ? _c : u}`, icon: 'success' });
            taro_1.default.switchTab({ url: '/pages/home/index' });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : '登录失败';
            taro_1.default.showToast({ title: msg, icon: 'none' });
        }
    };
    const handleLogin = async () => {
        setLoading(true);
        try {
            await submit();
        }
        finally {
            setLoading(false);
        }
    };
    const handleQuickLogin = async (q) => {
        if (busyKey)
            return;
        setBusyKey(q.key);
        try {
            await submit({ username: q.username, password: QUICK_PASSWORD });
        }
        finally {
            setBusyKey(null);
        }
    };
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.container, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.logo, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.logoMark, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.logoMarkText} display`, children: "\u671D" }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.logoTitle, children: "\u671D\u5915" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.logoSubtitle, children: "AI \u539F\u751F\u5B66\u751F\u5DE5\u4F5C\u670D\u52A1\u5E73\u53F0" })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.quickPanel, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.quickHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.quickTitle, children: "\u4E00\u952E\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.quickHint, children: "\u9009\u4E2A\u89D2\u8272\u76F4\u63A5\u8FDB\uFF0C\u6F14\u793A\u7528" })] }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.quickGrid, children: QUICK_USERS.map((q) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.quickChip} ${busyKey === q.key ? index_module_css_1.default.quickChipBusy : ''}`, onClick: () => handleQuickLogin(q), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.quickIcon, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: q.icon, color: "#3a6df0", size: 32 }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.quickRole, children: q.roleZh }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.quickName, children: q.realName })] }, q.key))) })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.divider, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.dividerLine }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.dividerText, children: "\u6216\u624B\u52A8\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.dividerLine })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.form, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.label, children: "\u8D26\u53F7" }), (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, value: username, onInput: (e) => setUsername(e.detail.value), placeholder: "\u5B66\u53F7 / \u6559\u5DE5\u53F7 / \u7528\u6237\u540D", maxlength: 64 }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.label, children: "\u5BC6\u7801" }), (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, value: password, onInput: (e) => setPassword(e.detail.value), password: true, placeholder: "\u8BF7\u8F93\u5165\u5BC6\u7801", maxlength: 64 }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.label, children: "\u79DF\u6237" }), (0, jsx_runtime_1.jsx)(components_1.Input, { className: index_module_css_1.default.input, value: tenantId, onInput: (e) => setTenantId(e.detail.value), placeholder: "default", maxlength: 32 }), (0, jsx_runtime_1.jsx)(components_1.Button, { className: index_module_css_1.default.loginBtn, onClick: handleLogin, loading: loading, children: "\u767B\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.devTip, children: "P0 \u6F14\u793A\u9636\u6BB5\uFF1B\u5FAE\u4FE1\u4E00\u952E\u767B\u5F55\u5C06\u4E8E P1 \u63A5\u5165" })] })] }));
}
//# sourceMappingURL=index.js.map