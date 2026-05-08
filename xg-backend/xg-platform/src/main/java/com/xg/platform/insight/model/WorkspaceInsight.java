package com.xg.platform.insight.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "workspace_insight", autoResultMap = true)
public class WorkspaceInsight {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    private String role;

    @TableField("scope_key")
    private String scopeKey;

    @TableField("generated_at")
    private OffsetDateTime generatedAt;

    @TableField("expired_at")
    private OffsetDateTime expiredAt;

    private String model;

    @TableField(value = "metrics", typeHandler = JsonbTypeHandler.class)
    private String metrics;

    @TableField(value = "insights", typeHandler = JsonbTypeHandler.class)
    private String insights;

    private String status;

    @TableField("error_message")
    private String errorMessage;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
