package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@TableName(value = "notification", autoResultMap = true)
public class Notification {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    private String title;

    private String content;

    /** normal / important / urgent */
    private String level;

    @TableField("source_type")
    private String sourceType;

    @TableField("source_id")
    private Long sourceId;

    /** in_app / miniprogram / wecom */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> channels;

    @TableField("require_confirm")
    private Boolean requireConfirm;

    @TableField("sender_id")
    private Long senderId;

    @TableField("created_by")
    private Long createdBy;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
