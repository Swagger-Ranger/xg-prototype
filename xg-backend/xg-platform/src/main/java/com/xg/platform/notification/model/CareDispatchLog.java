package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 关怀通知去重记录 — (tenant_id, rule_code, biz_type, biz_id) 唯一,
 * 同一规则同一业务对象只发 1 次。CareDispatcher 在调 Orchestrator 之前先 INSERT,
 * DuplicateKeyException 即视为已发,跳过。
 */
@Data
@TableName(value = "care_dispatch_log")
public class CareDispatchLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("rule_code")
    private String ruleCode;

    @TableField("biz_type")
    private String bizType;

    @TableField("biz_id")
    private Long bizId;

    @TableField("notification_id")
    private Long notificationId;

    @TableField("dispatched_at")
    private OffsetDateTime dispatchedAt;
}
