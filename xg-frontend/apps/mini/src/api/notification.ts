/**
 * Notifications API client (mini).
 *
 * 后端 source_type 是 deeplink 的依据，我们映射到 mini 端实际页面（部分类型在
 * mini 端没有对应页时，跳到列表 / 不跳）。
 */
import { get, put } from '../utils/request';

export type NotificationLevel = 'normal' | 'important' | 'urgent';

export interface MiniNotification {
  id: string;
  notification_id: string;
  title: string;
  content: string;
  level: NotificationLevel;
  source_type: string | null;
  source_id: string | null;
  require_confirm: boolean;
  read: boolean;
  read_at: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  created_at: string;
}

export interface MiniPage<T> {
  data: T[];
  total: number | string;
}

export function listMyNotifications(page = 1, size = 50) {
  return get<MiniPage<MiniNotification>>('/notifications/my', { page, size });
}

export function getUnreadCount() {
  return get<number>('/notifications/unread-count');
}

export function markAsRead(id: string) {
  return put<void>(`/notifications/${id}/read`);
}

export function confirmNotification(id: string) {
  return put<void>(`/notifications/${id}/confirm`);
}

/**
 * Map a notification's source_type → mini-app deeplink. Returns null when the
 * source type doesn't have a corresponding mini page; caller should silently
 * leave the notification non-clickable in that case.
 */
export function notificationDeeplink(n: MiniNotification): string | null {
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
