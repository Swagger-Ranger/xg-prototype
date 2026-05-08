package com.xg.platform.platformaudit.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Immutable audit row for platform-admin write operations. created_at is the
 * only timestamp; no updated_at, no deleted_at.
 */
@Getter
@Setter
@TableName(value = "platform_audit_log", autoResultMap = true)
public class PlatformAuditLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("admin_id")
    private Long adminId;

    @TableField("admin_username")
    private String adminUsername;

    @TableField("action")
    private String action;

    @TableField("target_type")
    private String targetType;

    @TableField("target_id")
    private String targetId;

    @TableField("description")
    private String description;

    @TableField(value = "before_data", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> beforeData;

    @TableField(value = "after_data", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> afterData;

    @TableField("ip_address")
    private String ipAddress;

    @TableField("user_agent")
    private String userAgent;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
