package com.xg.platform.notification.vo;

import lombok.Data;

import java.time.OffsetDateTime;

/**
 * Flattened recipient + notification record for the in-app notification list.
 * Built by {@code NotificationService.listMyNotifications} via two queries
 * (recipient page + batch notification fetch) — avoids custom JOIN SQL while
 * still surfacing title / content / level / source_* that the recipient row
 * alone doesn't carry.
 */
@Data
public class MyNotificationVO {

    /** notification_recipient.id — used for /read and /confirm endpoints. */
    private Long id;

    /** notification.id (the underlying message). */
    private Long notificationId;

    private String title;
    private String content;

    /** normal / important / urgent (from notification.level). */
    private String level;

    /** Drives front-end deeplink: leave / leave_return / workstudy_position /
     *  workstudy_application / workstudy_salary / workflow / system / ... */
    private String sourceType;
    private Long sourceId;

    private Boolean read;
    private OffsetDateTime readAt;

    private Boolean confirmed;
    private OffsetDateTime confirmedAt;

    private Boolean requireConfirm;

    /** notification.created_at — when the underlying message was created. */
    private OffsetDateTime createdAt;
}
