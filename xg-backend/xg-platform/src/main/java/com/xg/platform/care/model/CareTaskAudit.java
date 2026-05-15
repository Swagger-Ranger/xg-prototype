package com.xg.platform.care.model;

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
 * 关怀任务状态迁移流水：append-only。
 * CareTaskService.transition() 每次状态变化强制写一条；系统迁移（overdue_tick）actorId 为 null。
 */
@Getter
@Setter
@TableName(value = "care_task_audit", autoResultMap = true)
public class CareTaskAudit {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("task_id")
    private Long taskId;

    private String action;

    @TableField("from_status")
    private String fromStatus;

    @TableField("to_status")
    private String toStatus;

    @TableField("actor_id")
    private Long actorId;

    @TableField("actor_role")
    private String actorRole;

    @TableField(value = "payload", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> payload;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
