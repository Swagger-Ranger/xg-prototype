"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestInsight = getLatestInsight;
exports.parseInsights = parseInsights;
exports.sortBySeverity = sortBySeverity;
/**
 * Workspace insight client (mini).
 *
 * 后端 `/insights?role=counselor|dean` 返回最新 LLM 生成的 InsightItem 列表，
 * 是 sidecar 离线生成、定时刷新的快照——load 失败 / status 非 ready 时
 * 上层应当回退到规则化文案，永远不要把空状态当错误丢给用户。
 *
 * 学生角色没有 workspace insight，不要调用此接口。
 */
const request_1 = require("../utils/request");
const SEVERITY_RANK = {
    critical: 0,
    warn: 1,
    info: 2,
};
function getLatestInsight(role) {
    return (0, request_1.get)('/insights', { role });
}
function parseInsights(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (_a) {
        return [];
    }
}
/** 按严重度排序，未识别 severity 视为 info（最末尾）。 */
function sortBySeverity(items) {
    return [...items].sort((a, b) => { var _a, _b; return ((_a = SEVERITY_RANK[a.severity]) !== null && _a !== void 0 ? _a : 99) - ((_b = SEVERITY_RANK[b.severity]) !== null && _b !== void 0 ? _b : 99); });
}
//# sourceMappingURL=insight.js.map