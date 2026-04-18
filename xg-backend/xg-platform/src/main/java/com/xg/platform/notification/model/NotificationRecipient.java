package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("notification_recipient")
public class NotificationRecipient {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("notification_id")
    private Long notificationId;

    @TableField("user_id")
    private Long userId;

    /** in_app / miniprogram / wecom */
    private String channel;

    /** pending / sent / failed */
    private String status;

    private Boolean confirmed;

    @TableField("confirmed_at")
    private OffsetDateTime confirmedAt;

    @TableField("read_at")
    private OffsetDateTime readAt;

    @TableField("retry_count")
    private Integer retryCount;

    @TableField("last_error")
    private String lastError;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
