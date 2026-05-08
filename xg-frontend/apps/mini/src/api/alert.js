"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlertSummary = getAlertSummary;
/**
 * Alert summary (mini) — 仅给首页"今日简报"取 open_total + 严重度分桶。
 * 详情列表 / 处置动作走 web，mini 暂不暴露完整 alerts CRUD。
 */
const request_1 = require("../utils/request");
function getAlertSummary() {
    return (0, request_1.get)('/alerts/summary');
}
//# sourceMappingURL=alert.js.map