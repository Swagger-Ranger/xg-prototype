"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHomeMetrics = getHomeMetrics;
/**
 * Home page metrics aggregator.
 *
 * Fans out 4 parallel requests on home page mount and returns aggregated
 * counts. Each call falls back to 0 on failure — the home grid renders
 * gracefully whether or not every backend module is up.
 */
const request_1 = require("../utils/request");
function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
/**
 * Pulls 4 stats in parallel. Errors per call resolve to safe defaults so
 * that one missing endpoint doesn't blank out the whole home page.
 */
async function getHomeMetrics() {
    var _a, _b, _c;
    const month = currentMonth();
    const safeGet = async (promise, fallback) => {
        try {
            return await promise;
        }
        catch (_a) {
            return fallback;
        }
    };
    const [leaves, unread, apps, salaries] = await Promise.all([
        safeGet((0, request_1.get)('/leaves/my', { page: 1, size: 100 }), { data: [], total: 0 }),
        safeGet((0, request_1.get)('/notifications/unread-count'), 0),
        safeGet((0, request_1.get)('/work-study/applications', { page: 1, size: 100 }), { data: [], total: 0 }),
        safeGet((0, request_1.get)('/work-study/salaries', { page: 1, size: 100, month }), { data: [], total: 0 }),
    ]);
    // Pending leave count = status pending|cancel_pending
    const pendingLeaveCount = ((_a = leaves.data) !== null && _a !== void 0 ? _a : []).filter((l) => l.status === 'pending' || l.status === 'cancel_pending').length;
    // Pending app count = pending|recommended (recommended is a legacy "in flight" state)
    const pendingAppCount = ((_b = apps.data) !== null && _b !== void 0 ? _b : []).filter((a) => a.status === 'pending' || a.status === 'recommended').length;
    // Salary sum — only confirmed/paid count toward "本月薪资" (pending/draft are not yet earned).
    const monthSalary = ((_c = salaries.data) !== null && _c !== void 0 ? _c : [])
        .filter((s) => s.status === 'confirmed' || s.status === 'paid')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    return {
        pendingLeaveCount,
        unreadCount: Number(unread) || 0,
        pendingAppCount,
        monthSalary,
        month,
    };
}
//# sourceMappingURL=home.js.map