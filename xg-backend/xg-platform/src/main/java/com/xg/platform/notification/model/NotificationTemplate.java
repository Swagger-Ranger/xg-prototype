package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonRawValue;
import com.xg.common.mybatis.JsonbTypeHandler;
import com.xg.common.mybatis.PostgresTextArrayTypeHandler;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 通知模板字典 — Orchestrator 按 code 路由到具体文案 / 默认渠道。
 * 表见 V089__create_notification_center.sql。
 */
@Data
@TableName(value = "notification_template", autoResultMap = true)
public class NotificationTemplate {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    private String code;

    /** business / care / system */
    private String category;

    @TableField("biz_module")
    private String bizModule;

    @TableField("title_tmpl")
    private String titleTmpl;

    @TableField("body_tmpl")
    private String bodyTmpl;

    @TableField(value = "default_channels", typeHandler = PostgresTextArrayTypeHandler.class)
    private List<String> defaultChannels;

    @TableField("default_level")
    private String defaultLevel;

    @TableField("wx_template_id")
    private String wxTemplateId;

    private Boolean enabled;

    private String description;

    /** 收件人配置 JSON,例:[{"type":"applicant"},{"type":"applicant_counselor","cc":true}]
     *  写时由 NotificationCenterService 校验结构,读时由 NotificationOrchestrator 解析。 */
    @Getter(AccessLevel.NONE)
    @JsonRawValue
    @TableField(value = "recipients", typeHandler = JsonbTypeHandler.class)
    private String recipients;

    public String getRecipients() {
        return recipients;
    }

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
