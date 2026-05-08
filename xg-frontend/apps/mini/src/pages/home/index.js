"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomePage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const components_1 = require("@tarojs/components");
const taro_1 = __importDefault(require("@tarojs/taro"));
const icons_1 = require("../../utils/icons");
const leave_1 = require("../../api/leave");
const notification_1 = require("../../api/notification");
const workflow_1 = require("../../api/workflow");
const alert_1 = require("../../api/alert");
const insight_1 = require("../../api/insight");
const index_module_css_1 = __importDefault(require("./index.module.css"));
/* 首页 — 与 web TodayBriefCard + InsightCard 对齐。
 *
 * 「今日简报」永远是规则化（不走 LLM）—— summary 一段话 + 4 stats + items 清单。
 * 「AI 观察员」仅 staff 显示，走 /insights 拉 LLM item list 渲染。
 *
 * 两块职责截然分开：今日简报 = 当下数据快照；观察员 = LLM 视角的关注点。
 */
const STAFF_ROLES = ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'];
const INSIGHT_ROLES = ['counselor', 'dean'];
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
function primaryRoleZh(roles) {
    var _a;
    const r = roles === null || roles === void 0 ? void 0 : roles[0];
    return r ? (_a = ROLE_LABELS[r]) !== null && _a !== void 0 ? _a : r : '';
}
const MONTH_LABELS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
function todayHeroDate() {
    const now = new Date();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    return {
        big: `${MONTH_LABELS[now.getMonth()]}${now.getDate()}日`,
        small: `周${weekday} · ${now.getFullYear()}`,
    };
}
function isStaff(roles) {
    return (roles !== null && roles !== void 0 ? roles : []).some((r) => STAFF_ROLES.includes(r));
}
function pickInsightRole(roles) {
    if (!(roles === null || roles === void 0 ? void 0 : roles.length))
        return null;
    if (roles.includes('dean'))
        return 'dean';
    if (roles.includes('counselor'))
        return 'counselor';
    return null;
}
function avatarInitials(name) {
    if (!(name === null || name === void 0 ? void 0 : name.trim()))
        return '?';
    const trimmed = name.trim();
    const isChinese = /[一-龥]/.test(trimmed);
    return isChinese ? trimmed.slice(-1) : trimmed.slice(0, 1).toUpperCase();
}
function todayDateLabel() {
    const now = new Date();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 周${weekday}`;
}
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const SEVERITY_LABELS = {
    info: '提示',
    warn: '关注',
    critical: '紧急',
};
function buildQuickActions(roles) {
    const staff = isStaff(roles);
    return [
        staff
            ? { key: 'leave', icon: 'edit', label: '请假审批', path: '/pages/leave/approval/index' }
            : { key: 'leave', icon: 'edit', label: '我的请假', path: '/pages/leave/list/index' },
        { key: 'notify', icon: 'bell', label: '通知', path: '/pages/notifications/index' },
        {
            key: 'work',
            icon: 'briefcase',
            label: staff ? '班级请假' : '我的勤工',
            path: staff ? '/pages/leave/class/index' : '/pages/myWorkStudy/index',
        },
        { key: 'schedule', icon: 'calendar', label: '我的课表', path: '/pages/schedule/index' },
    ];
}
/* ── 学生版 brief ────────────────────────────────────── */
function buildStudentBrief(args) {
    const { myLeaves, totalLeaveCount, unreadCount, name } = args;
    const pending = myLeaves.filter((l) => l.status === 'pending' || l.status === 'cancel_pending').length;
    const approved = myLeaves.filter((l) => l.status === 'approved').length;
    const opener = name ? `${name}同学，` : '';
    let summary;
    if (pending === 0 && unreadCount === 0) {
        summary = `${opener}今日一切就绪——没有待办审批，也没有未读通知，安心上课即可。${totalLeaveCount > 0 ? ` 历史请假 ${totalLeaveCount} 条可在下方回顾。` : ''}`;
    }
    else {
        const chips = [];
        if (pending > 0)
            chips.push(`${pending} 条请假正在审批`);
        if (unreadCount > 0)
            chips.push(`未读通知 ${unreadCount} 条`);
        summary = `${opener}今日需要关注：${chips.join('、')}。`;
        if (pending > 0)
            summary += '请留意审批结果，结果变化后会在通知中心同步。';
        else if (unreadCount >= 3)
            summary += '建议先过一遍通知，避免漏掉重要事项。';
    }
    const stats = [
        {
            label: '我的请假',
            value: totalLeaveCount,
            footer: totalLeaveCount > 0 ? '累计' : '暂无',
            href: '/pages/leave/list/index',
        },
        {
            label: '审批中',
            value: pending,
            footer: pending > 0 ? '等待审批' : '无',
            href: '/pages/leave/list/index',
        },
        {
            label: '已通过',
            value: approved,
            footer: '近 5 条中',
            href: '/pages/leave/list/index',
        },
        {
            label: '未读通知',
            value: unreadCount,
            footer: unreadCount > 0 ? '待查看' : '已读完',
            href: '/pages/notifications/index',
        },
    ];
    const items = [];
    if (pending > 0) {
        items.push({
            icon: 'file-text',
            tone: 'warn',
            href: '/pages/leave/list/index',
            segments: [{ text: '您有 ' }, { value: pending, tone: 'warn' }, { text: ' 条请假正在审批中' }],
            trail: '点击查看进度',
        });
    }
    if (unreadCount > 0) {
        items.push({
            icon: 'bell',
            href: '/pages/notifications/index',
            segments: [{ text: '未读通知 ' }, { value: unreadCount }, { text: ' 条' }],
        });
    }
    return { summary, stats, items };
}
/* ── 辅导员版 brief ──────────────────────────────────── */
function buildCounselorBrief(args) {
    const { pendingCount, todayLeaveCount, unreadCount, openAlertTotal, criticalHighTotal, name } = args;
    const opener = name ? `${name}老师，` : '';
    const total = pendingCount + openAlertTotal + unreadCount;
    let summary;
    if (total === 0 && todayLeaveCount === 0) {
        summary = `${opener}今日班级整体平稳，无待办、无预警、无未读。可以把节奏放在主动走访与学生关怀上。`;
    }
    else {
        const chips = [];
        if (pendingCount > 0)
            chips.push(`待审 ${pendingCount} 条`);
        if (todayLeaveCount > 0)
            chips.push(`今日 ${todayLeaveCount} 人不在校`);
        if (openAlertTotal > 0)
            chips.push(`${openAlertTotal} 位学生触发预警`);
        if (unreadCount > 0)
            chips.push(`未读通知 ${unreadCount} 条`);
        summary = `${opener}今日关注：${chips.join('、')}。`;
        if (criticalHighTotal > 0) {
            summary += `其中 ${criticalHighTotal} 位已升到紧急级别，建议最先处理。`;
        }
        else if (pendingCount >= 5) {
            summary += `审批积压到 ${pendingCount} 条，建议今天集中清理一轮。`;
        }
    }
    const stats = [
        {
            label: '待审批',
            value: pendingCount,
            footer: pendingCount > 0 ? '审批中' : '已清空',
            href: '/pages/leave/approval/index',
        },
        {
            label: '今日离校',
            value: todayLeaveCount,
            footer: todayLeaveCount > 0 ? '离校中' : '无',
            href: '/pages/leave/class/index',
        },
        {
            label: '未读',
            value: unreadCount,
            footer: unreadCount > 0 ? '待查看' : '已读完',
            href: '/pages/notifications/index',
        },
        {
            label: '需关注学生',
            value: openAlertTotal,
            footer: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : '全部正常',
            critical: criticalHighTotal > 0,
            // mini 暂无 alerts 详情页，留空
        },
    ];
    const items = [];
    if (pendingCount > 0) {
        items.push({
            icon: 'check',
            tone: pendingCount >= 5 ? 'warn' : 'normal',
            href: '/pages/leave/approval/index',
            segments: [
                { text: '您有 ' },
                { value: pendingCount, tone: pendingCount >= 5 ? 'warn' : 'normal' },
                { text: ' 件审批待处理' },
            ],
            trail: pendingCount >= 5 ? '集中处理一轮' : undefined,
        });
    }
    if (todayLeaveCount > 0) {
        items.push({
            icon: 'file-text',
            href: '/pages/leave/class/index',
            segments: [{ text: '班级今日 ' }, { value: todayLeaveCount }, { text: ' 人在请假中' }],
        });
    }
    if (openAlertTotal > 0) {
        items.push({
            icon: 'alert-triangle',
            tone: criticalHighTotal > 0 ? 'danger' : 'warn',
            segments: [
                { value: openAlertTotal, tone: criticalHighTotal > 0 ? 'danger' : 'warn' },
                { text: ' 位学生触发预警' },
            ],
            trail: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : undefined,
        });
    }
    if (unreadCount > 0) {
        items.push({
            icon: 'bell',
            href: '/pages/notifications/index',
            segments: [{ text: '未读通知 ' }, { value: unreadCount }, { text: ' 条' }],
        });
    }
    return { summary, stats, items };
}
function HomePage() {
    var _a, _b, _c, _d, _e;
    const [user, setUser] = (0, react_1.useState)(null);
    const [brief, setBrief] = (0, react_1.useState)(null);
    const [insights, setInsights] = (0, react_1.useState)(null);
    const [recentLeaves, setRecentLeaves] = (0, react_1.useState)(null);
    const [unreadCount, setUnreadCount] = (0, react_1.useState)(0);
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        const raw = taro_1.default.getStorageSync('user');
        const token = taro_1.default.getStorageSync('token');
        if (raw)
            setUser(raw);
        // 未登录直接结束 loading，不打任何 API——
        // 否则 N 个并发 401 会导致 request 层 N 次 reLaunch 触发 page mount 超时
        if (!token) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const safe = async (p, fallback) => {
            try {
                return await p;
            }
            catch (_a) {
                return fallback;
            }
        };
        (async () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const userId = String(taro_1.default.getStorageSync('userId') || '');
            const staff = isStaff(raw === null || raw === void 0 ? void 0 : raw.roleCodes);
            const insightRole = pickInsightRole(raw === null || raw === void 0 ? void 0 : raw.roleCodes);
            // 共用：未读数
            const unread = await safe((0, notification_1.getUnreadCount)(), 0);
            let nextBrief;
            if (staff) {
                const [pending, classLeavesToday, alertSummary] = await Promise.all([
                    userId ? safe((0, workflow_1.listPendingEnriched)({ page: 1, size: 5, assigneeId: userId }), { data: [], total: 0 }) : Promise.resolve({ data: [], total: 0 }),
                    // class leaves 用于今日离校粗略估计：取 status=approved 的近 50 条，过滤起止跨今日
                    safe((0, leave_1.listClassLeaves)({ page: 1, size: 50, status: 'approved' }), { data: [], total: 0 }),
                    safe((0, alert_1.getAlertSummary)(), { open_total: '0', by_severity: {} }),
                ]);
                const today = todayISO();
                const todayLeaveCount = ((_a = classLeavesToday.data) !== null && _a !== void 0 ? _a : []).filter((l) => {
                    var _a, _b;
                    const s = ((_a = l.start_time) !== null && _a !== void 0 ? _a : '').slice(0, 10);
                    const e = ((_b = l.end_time) !== null && _b !== void 0 ? _b : '').slice(0, 10);
                    return s <= today && today <= e;
                }).length;
                const openAlertTotal = Number((_b = alertSummary.open_total) !== null && _b !== void 0 ? _b : 0);
                const criticalHighTotal = Number((_d = (_c = alertSummary.by_severity) === null || _c === void 0 ? void 0 : _c.critical) !== null && _d !== void 0 ? _d : 0) +
                    Number((_f = (_e = alertSummary.by_severity) === null || _e === void 0 ? void 0 : _e.high) !== null && _f !== void 0 ? _f : 0);
                nextBrief = buildCounselorBrief({
                    pendingCount: Number((_g = pending.total) !== null && _g !== void 0 ? _g : 0),
                    todayLeaveCount,
                    unreadCount: unread,
                    openAlertTotal,
                    criticalHighTotal,
                    name: raw === null || raw === void 0 ? void 0 : raw.realName,
                });
            }
            else {
                const myLeaves = await safe((0, leave_1.listMyLeaves)({ page: 1, size: 5 }), { data: [], total: 0 });
                const data = (_h = myLeaves.data) !== null && _h !== void 0 ? _h : [];
                if (!cancelled)
                    setRecentLeaves(data);
                nextBrief = buildStudentBrief({
                    myLeaves: data,
                    totalLeaveCount: Number((_j = myLeaves.total) !== null && _j !== void 0 ? _j : 0),
                    unreadCount: unread,
                    name: raw === null || raw === void 0 ? void 0 : raw.realName,
                });
            }
            // staff 拉 LLM 观察员（独立，与 brief 无关）
            let nextInsights = null;
            if (insightRole) {
                const res = await safe((0, insight_1.getLatestInsight)(insightRole), null);
                if (res && res.status === 'ready') {
                    nextInsights = (0, insight_1.sortBySeverity)((0, insight_1.parseInsights)(res.insights));
                }
                else {
                    nextInsights = [];
                }
            }
            if (!cancelled) {
                setUnreadCount(unread);
                setBrief(nextBrief);
                setInsights(nextInsights);
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const quick = buildQuickActions(user === null || user === void 0 ? void 0 : user.roleCodes);
    const showInsights = insights !== null; // staff
    const dateLabel = todayDateLabel();
    const heroDate = todayHeroDate();
    const isLoggedIn = !!user;
    const userRoleZh = primaryRoleZh(user === null || user === void 0 ? void 0 : user.roleCodes);
    const displayName = (_b = (_a = user === null || user === void 0 ? void 0 : user.realName) !== null && _a !== void 0 ? _a : user === null || user === void 0 ? void 0 : user.username) !== null && _b !== void 0 ? _b : '';
    return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.page, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.hero, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.heroText, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.heroEyebrow, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroEyebrowDate} num`, children: heroDate.big }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroEyebrowSep, children: " \u00B7 " }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroEyebrowMeta, children: heroDate.small })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.heroDisplay} display`, children: isLoggedIn ? (displayName || '匿名用户') : '未登录' }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroSubline, children: isLoggedIn
                                    ? (userRoleZh ? `${userRoleZh} · 我的工作台` : '我的工作台')
                                    : '登录后查看待办与通知' })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.heroActions, children: [isLoggedIn && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.heroBtn} tap-min`, onClick: () => taro_1.default.navigateTo({ url: '/pages/notifications/index' }), children: [(0, jsx_runtime_1.jsx)(icons_1.Icon, { name: "bell", color: "#0f1421", size: 36 }), unreadCount > 0 && (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.heroBtnDot })] })), isLoggedIn && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.avatar} tap-min`, onClick: () => taro_1.default.switchTab({ url: '/pages/profile/index' }), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.avatarText, children: avatarInitials(displayName) }) })), !isLoggedIn && ((0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.heroLoginBtn} tap-min`, onClick: () => taro_1.default.reLaunch({ url: '/pages/login/index' }), children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.heroLoginBtnLabel, children: "\u524D\u5F80\u767B\u5F55" }) }))] })] }), (0, jsx_runtime_1.jsx)(components_1.ScrollView, { scrollX: true, className: index_module_css_1.default.chipsScroll, showScrollbar: false, children: (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.chips, children: quick.map((a) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.chip} tap-min`, onClick: () => taro_1.default.navigateTo({ url: a.path }).catch(() => {
                            taro_1.default.showToast({ title: '该模块即将上线', icon: 'none' });
                        }), children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.chipIcon, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: a.icon, color: "#3a6df0", size: 32 }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.chipLabel, children: a.label })] }, a.key))) }) }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u4ECA\u65E5\u7B80\u62A5" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionDate, children: dateLabel })] }), (0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.briefCard, children: [loading ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.briefSummary, children: "\u6B63\u5728\u62C9\u53D6\u4F60\u7684\u4ECA\u65E5\u6570\u636E\u2026" })) : ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.briefSummary, children: brief === null || brief === void 0 ? void 0 : brief.summary })), (0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.statsGrid, children: ((_c = brief === null || brief === void 0 ? void 0 : brief.stats) !== null && _c !== void 0 ? _c : []).map((s) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.statCell} ${s.href ? index_module_css_1.default.statCellLink : ''}`, onClick: s.href ? () => taro_1.default.navigateTo({ url: s.href }) : undefined, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.statLabel, children: s.label }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.statValue} num ${s.critical ? index_module_css_1.default.statValueCritical : ''}`, children: s.value }), s.footer && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.statFooter, children: s.footer })] }, s.label))) }), ((_d = brief === null || brief === void 0 ? void 0 : brief.items) !== null && _d !== void 0 ? _d : []).length > 0 && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.itemsList, children: ((_e = brief === null || brief === void 0 ? void 0 : brief.items) !== null && _e !== void 0 ? _e : []).map((it, i) => ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.item} ${it.href ? index_module_css_1.default.itemLink : ''}`, onClick: it.href ? () => taro_1.default.navigateTo({ url: it.href }) : undefined, children: [(0, jsx_runtime_1.jsx)(components_1.View, { className: `${index_module_css_1.default.itemIcon} ${it.tone ? index_module_css_1.default[`tone_${it.tone}`] : ''}`, children: (0, jsx_runtime_1.jsx)(icons_1.Icon, { name: it.icon, color: "currentColor", size: 28 }) }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.itemText, children: it.segments.flatMap((seg, j) => {
                                        // Mini 端 <text> 嵌套 3 层会炸；摊平到 2 层最多。
                                        const out = [];
                                        if (seg.text)
                                            out.push((0, jsx_runtime_1.jsx)(components_1.Text, { children: seg.text }, `t${j}`));
                                        if (seg.value !== undefined && seg.value !== '') {
                                            const toneCls = seg.tone ? index_module_css_1.default[`numTone_${seg.tone}`] : '';
                                            out.push((0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.itemNum} num ${toneCls}`, children: seg.value }, `v${j}`));
                                        }
                                        return out;
                                    }) }), it.trail && (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.itemTrail, children: it.trail })] }, i))) }))] }), !showInsights && isLoggedIn && recentLeaves !== null && ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "\u6211\u7684\u8BF7\u5047\u8BB0\u5F55" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionDate, children: recentLeaves.length > 0 ? '近 5 条' : '暂无' })] }), recentLeaves.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.observerEmpty, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.observerEmptyText, children: "\u6682\u65E0\u8BF7\u5047\u8BB0\u5F55" }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.leaveList, children: recentLeaves.map((l) => {
                            var _a;
                            const tone = leave_1.LEAVE_STATUS_TONES[l.status];
                            return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.leaveRow, onClick: () => taro_1.default.navigateTo({ url: `/pages/leave/detail/index?id=${l.id}` }), children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.leaveMain, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.leaveTitle, children: [l.leave_type_name || '请假', (0, jsx_runtime_1.jsxs)(components_1.Text, { className: index_module_css_1.default.leaveDays, children: [" \u00B7 ", l.duration_days, "\u5929"] })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.leaveDate} num`, children: ((_a = l.start_time) !== null && _a !== void 0 ? _a : '').slice(0, 10) })] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.leaveStatus} ${index_module_css_1.default[`leaveStatus_${tone}`]}`, children: leave_1.LEAVE_STATUS_LABELS[l.status] })] }, l.id));
                        }) }))] })), showInsights && ((0, jsx_runtime_1.jsxs)(components_1.View, { children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.sectionHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.sectionTitle, children: "AI \u89C2\u5BDF\u5458" }), insights.length > 0 && ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.sectionBadge, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.sectionBadgeText} num`, children: insights.length }) }))] }), insights.length === 0 ? ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.observerEmpty, children: (0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.observerEmptyText, children: "\u6682\u65E0 AI \u89C2\u5BDF\u9879\u3002Sidecar \u79BB\u7EBF\u6216\u672C\u671F\u6682\u65E0\u5173\u6CE8\u70B9\u3002" }) })) : ((0, jsx_runtime_1.jsx)(components_1.View, { className: index_module_css_1.default.observerList, children: insights.map((it, i) => {
                            var _a;
                            return ((0, jsx_runtime_1.jsxs)(components_1.View, { className: `${index_module_css_1.default.observerCard} ${i === 0 ? index_module_css_1.default.observerCardLead : ''}`, children: [(0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.observerHead, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: `${index_module_css_1.default.observerSeverity} ${index_module_css_1.default[`sev_${it.severity}`]}`, children: (_a = SEVERITY_LABELS[it.severity]) !== null && _a !== void 0 ? _a : it.severity }), it.category && ((0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.observerCategory, children: it.category }))] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: i === 0 ? index_module_css_1.default.observerTitleLead : index_module_css_1.default.observerTitle, children: it.title }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: i === 0 ? index_module_css_1.default.observerBodyLead : index_module_css_1.default.observerBody, numberOfLines: 4, children: it.detail }), it.suggestion && ((0, jsx_runtime_1.jsxs)(components_1.View, { className: index_module_css_1.default.observerSuggest, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: index_module_css_1.default.observerSuggestLabel, children: "\u5EFA\u8BAE" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: i === 0 ? index_module_css_1.default.observerSuggestTextLead : index_module_css_1.default.observerSuggestText, children: it.suggestion })] }))] }, i));
                        }) }))] }))] }));
}
//# sourceMappingURL=index.js.map