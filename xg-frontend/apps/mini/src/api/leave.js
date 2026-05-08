"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAVE_STATUS_TONES = exports.LEAVE_STATUS_LABELS = void 0;
exports.getLeaveTypes = getLeaveTypes;
exports.listMyLeaves = listMyLeaves;
exports.listClassLeaves = listClassLeaves;
exports.listUncancelledLeaves = listUncancelledLeaves;
exports.getLeaveDetail = getLeaveDetail;
exports.applyLeave = applyLeave;
exports.withdrawLeave = withdrawLeave;
exports.cancelLeave = cancelLeave;
exports.confirmCancelLeave = confirmCancelLeave;
exports.forceCancelLeave = forceCancelLeave;
exports.returnByLocation = returnByLocation;
exports.applyManualReturn = applyManualReturn;
exports.getLeaveImpact = getLeaveImpact;
exports.previewLeaveImpact = previewLeaveImpact;
exports.calculateDurationDays = calculateDurationDays;
/**
 * Leave API client (student-facing).
 *
 * Mirrors apps/web/src/api/leave.ts, scoped to what the mini-program needs:
 *  · 学生：列表 / 详情 / 提交 / 撤回 / 销假
 *  · 假别字典 + 假别动态字段（extra_fields）
 *
 * 辅导员审批走 workflow 端点，单独建文件。
 */
const request_1 = require("../utils/request");
exports.LEAVE_STATUS_LABELS = {
    draft: '草稿',
    pending: '审批中',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已撤销',
    cancel_pending: '销假审批中',
    pending_manual_return: '人工销假待审',
};
exports.LEAVE_STATUS_TONES = {
    draft: 'muted',
    pending: 'pending',
    approved: 'ok',
    rejected: 'danger',
    cancelled: 'muted',
    cancel_pending: 'warn',
    pending_manual_return: 'warn',
};
function getLeaveTypes() {
    return (0, request_1.get)('/leave-types');
}
function listMyLeaves(params) {
    return (0, request_1.get)('/leaves/my', params);
}
/**
 * 班级请假总览（辅导员视角）。后端按 counselor 当前班级范围过滤；
 * 可选 status / leave_type_code / 日期 范围进一步收窄。
 */
function listClassLeaves(params) {
    return (0, request_1.get)('/leaves/class', params);
}
/**
 * 未销假总览：已批准但学生未提交销假，或已过结束时间还没销。辅导员处理
 * "学生忘记销假"的入口。
 */
function listUncancelledLeaves(params) {
    return (0, request_1.get)('/leaves/uncancelled', params);
}
function getLeaveDetail(id) {
    return (0, request_1.get)(`/leaves/${id}`);
}
function applyLeave(data) {
    return (0, request_1.post)('/leaves', data);
}
function withdrawLeave(id) {
    return (0, request_1.post)(`/leaves/${id}/withdraw`);
}
function cancelLeave(id) {
    return (0, request_1.post)(`/leaves/${id}/cancel`);
}
/** 辅导员侧确认学生提交的销假申请（status: cancel_pending → cancelled）。 */
function confirmCancelLeave(id) {
    return (0, request_1.post)(`/leaves/${id}/cancel-confirm`);
}
/** 辅导员强制销假（学生未提交销假或异常情况），不可撤销。 */
function forceCancelLeave(id) {
    return (0, request_1.post)(`/leaves/${id}/force-cancel`);
}
function returnByLocation(id, latitude, longitude, capturedAt) {
    return (0, request_1.post)(`/leaves/${id}/return/by-location`, {
        latitude,
        longitude,
        capturedAt,
    });
}
function applyManualReturn(id, reason, attachments) {
    return (0, request_1.post)(`/leaves/${id}/return/manual-apply`, {
        reason,
        attachments,
    });
}
function getLeaveImpact(id) {
    return (0, request_1.get)(`/leaves/${id}/impact`);
}
/** 学生填表时实时预览会缺的课程。后端按 X-User-Id 取 student_id;
 *  非学生身份会返回 zero 视图,前端按 total_periods 判空态隐藏。 */
function previewLeaveImpact(start, end) {
    return (0, request_1.get)('/leaves/impact/preview', { start, end });
}
/**
 * Mirror backend LeaveService.calculateDurationDays:
 *   ceil(seconds / 86400) — any partial day counts as a full day so that the
 *   workflow's duration_check sees the same number we display.
 *
 * `start` / `end` are ms-since-epoch.
 */
function calculateDurationDays(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        return 0;
    return Math.max(0, Math.ceil((end - start) / 1000 / 86400));
}
//# sourceMappingURL=leave.js.map