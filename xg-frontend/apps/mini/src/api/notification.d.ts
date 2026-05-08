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
export declare function listMyNotifications(page?: number, size?: number): Promise<MiniPage<MiniNotification>>;
export declare function getUnreadCount(): Promise<number>;
export declare function markAsRead(id: string): Promise<void>;
export declare function confirmNotification(id: string): Promise<void>;
/**
 * Map a notification's source_type → mini-app deeplink. Returns null when the
 * source type doesn't have a corresponding mini page; caller should silently
 * leave the notification non-clickable in that case.
 */
export declare function notificationDeeplink(n: MiniNotification): string | null;
//# sourceMappingURL=notification.d.ts.map