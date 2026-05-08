"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyNotifications = listMyNotifications;
exports.getUnreadCount = getUnreadCount;
exports.markAsRead = markAsRead;
exports.confirmNotification = confirmNotification;
exports.notificationDeeplink = notificationDeeplink;
/**
 * Notifications API client (mini).
 *
 * 后端 source_type 是 deeplink 的依据，我们映射到 mini 端实际页面（部分类型在
 * mini 端没有对应页时，跳到列表 / 不跳）。
 */
const request_1 = require("../utils/request");
function listMyNotifications(page = 1, size = 50) {
    return (0, request_1.get)('/notifications/my', { page, size });
}
function getUnreadCount() {
    return (0, request_1.get)('/notifications/unread-count');
}
function markAsRead(id) {
    return (0, request_1.put)(`/notifications/${id}/read`);
}
function confirmNotification(id) {
    return (0, request_1.put)(`/notifications/${id}/confirm`);
}
/**
 * Map a notification's source_type → mini-app deeplink. Returns null when the
 * source type doesn't have a corresponding mini page; caller should silently
 * leave the notification non-clickable in that case.
 */
function notificationDeeplink(n) {
    const id = n.source_id;
    switch (n.source_type) {
        case 'leave':
        case 'leave_return':
            return id ? `/pages/leave/detail/index?id=${id}` : '/pages/leave/list/index';
        case 'workstudy_position':
            return id ? `/pages/workStudyDetail/index?id=${id}` : '/pages/workStudy/index';
        case 'workstudy_application':
            return '/pages/myWorkStudy/index?tab=apps';
        case 'workstudy_salary':
            return '/pages/myWorkStudy/index?tab=salary';
        default:
            return null;
    }
}
//# sourceMappingURL=notification.js.map