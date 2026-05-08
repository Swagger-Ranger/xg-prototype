package com.xg.platform.alert.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.Map;

@Getter
@Setter
@TableName(value = "student_alert", autoResultMap = true)
public class StudentAlert {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("student_id")
    private Long studentId;

    @TableField("alert_rule_id")
    private Long alertRuleId;

    @TableField("rule_name")
    private String ruleName;

    private String severity;

    @TableField(value = "trigger_data", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> triggerData;

    private String status;

    @TableField("acknowledged_by")
    private Long acknowledgedBy;

    @TableField("acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @TableField("resolved_at")
    private OffsetDateTime resolvedAt;

    private String note;

    @TableField("counselor_talk_id")
    private Long counselorTalkId;

    @TableField("muted_until")
    private OffsetDateTime mutedUntil;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
