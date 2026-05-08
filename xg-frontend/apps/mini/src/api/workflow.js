"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPendingEnriched = listPendingEnriched;
exports.approveTask = approveTask;
exports.rejectTask = rejectTask;
/**
 * Workflow API client (审批侧).
 *
 * 仅暴露 mini 端审批所需端点：待审 list + 批准 + 驳回。
 * 后端 ApprovalRequest / BatchApproveRequest 把 operator_id 声明为 @NotNull
 * 且只读 body（不读 X-User-Id），所以 approve/reject 调用必须把 userId 塞进
 * 请求体——不能依赖 request 层的 header 注入。
 */
const taro_1 = __importDefault(require("@tarojs/taro"));
const request_1 = require("../utils/request");
function listPendingEnriched(params) {
    return (0, request_1.get)('/workflows/tasks/pending-enriched', {
        page: params.page,
        size: params.size,
        assigneeId: params.assigneeId,
    });
}
function operatorId() {
    return String(taro_1.default.getStorageSync('userId') || '');
}
function approveTask(taskId, comment) {
    return (0, request_1.post)(`/workflows/tasks/${taskId}/approve`, {
        comment,
        operator_id: operatorId(),
    });
}
function rejectTask(taskId, comment) {
    return (0, request_1.post)(`/workflows/tasks/${taskId}/reject`, {
        comment,
        operator_id: operatorId(),
    });
}
//# sourceMappingURL=workflow.js.map