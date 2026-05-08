import type { PageResult } from '@xg1/shared';
import api from './index';

export interface Notification {
  id: string;
  notification_id: string;
  title: string;
  content: string;
  /** normal / important / urgent */
  level: 'normal' | 'important' | 'urgent';
  /** Drives deeplink routing: leave / leave_return / workstudy_position /
   *  workstudy_application / workstudy_salary / workflow / system / ... */
  source_type: string | null;
  source_id: string | null;
  require_confirm: boolean;
  read: boolean;
  read_at: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  created_at: string;
}

export interface NotificationQueryParams {
  page: number;
  size: number;
}

export function getMyNotifications(params: NotificationQueryParams): Promise<PageResult<Notification>> {
  return api.get('/notifications/my', { params }).then((res) => res.data);
}

export function getUnreadCount(): Promise<number> {
  return api.get('/notifications/unread-count').then((res) => res.data);
}

export function markAsRead(id: string): Promise<void> {
  return api.put(`/notifications/${id}/read`).then(() => undefined);
}

export function confirmNotification(id: string): Promise<void> {
  return api.put(`/notifications/${id}/confirm`).then(() => undefined);
}

export interface SendNotificationData {
  title: string;
  content: string;
  type: 'system' | 'workflow' | 'reminder';
  priority: 'normal' | 'urgent';
}

// NOTE: Backend exposes this on /internal/v1/notifications/send (internal-only).
// Update path when a public endpoint is available.
export function sendNotification(data: SendNotificationData): Promise<unknown> {
  return api.post('/notifications/send', data).then((res) => res.data);
}
