package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.PostgresTextArrayTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 通知渠道偏好 — 三层覆盖:tmpl.default_channels < scope=role < scope=user。
 * Orchestrator 按 (scope_type, scope_value, template_code) 命中,缺失则走默认。
 */
@Data
@TableName(value = "notification_preference", autoResultMap = true)
public class NotificationPreference {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    /** role / user */
    @TableField("scope_type")
    private String scopeType;

    /** scope_type=role 时是 role_code;scope_type=user 时是 user_id 字符串 */
    @TableField("scope_value")
    private String scopeValue;

    @TableField("template_code")
    private String templateCode;

    @TableField(typeHandler = PostgresTextArrayTypeHandler.class)
    private List<String> channels;

    private Boolean muted;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
