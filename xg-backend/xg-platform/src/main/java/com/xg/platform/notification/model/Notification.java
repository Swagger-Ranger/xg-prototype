package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.PostgresTextArrayTypeHandler;
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

    /** in_app / miniprogram / wecom — PG text[] column, bound as SQL array. */
    @TableField(typeHandler = PostgresTextArrayTypeHandler.class)
    private List<String> channels;

    @TableField("require_confirm")
    private Boolean requireConfirm;

    @TableField("sender_id")
    private Long senderId;

    @TableField("created_by")
    private Long createdBy;

    /** 触发模板码;轨 2 (Orchestrator) 通知必填,轨 1 (YAML) 通知留空。
     *  跟 (source_type, source_id) 联合做双轨去重。 */
    @TableField("template_code")
    private String templateCode;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
