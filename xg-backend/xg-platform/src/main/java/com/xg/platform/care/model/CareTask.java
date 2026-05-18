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
 * 主动关怀任务：W2 起替代旧 student_alert 作为核心业务对象。
 * 状态机由 CareTaskService.transition() 守门，库表不加 CHECK 以便规则升级时扩展。
 * 终态：resolved / rejected / transferred。overdue 不是终态。
 */
@Getter
@Setter
@TableName(value = "care_task", autoResultMap = true)
public class CareTask {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("student_id")
    private Long studentId;

    @TableField("rule_id")
    private String ruleId;

    @TableField("rule_version")
    private String ruleVersion;

    private String severity;

    @TableField(value = "trigger_data", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> triggerData;

    @TableField("current_brief_id")
    private Long currentBriefId;

    private String status;

    @TableField("assigned_to")
    private Long assignedTo;

    @TableField("due_at")
    private OffsetDateTime dueAt;

    @TableField("accepted_at")
    private OffsetDateTime acceptedAt;

    @TableField("accepted_by")
    private Long acceptedBy;

    @TableField("reschedule_count")
    private Integer rescheduleCount;

    /** 最近一次规则再次命中时间；merge 时刷新 */
    @TableField("last_triggered_at")
    private OffsetDateTime lastTriggeredAt;

    /** 同一规则累计命中次数；merge 累加，新建为 1 */
    @TableField("trigger_count")
    private Integer triggerCount;

    /** 关闭时物化 = closed_at + rule.cooldown_days；此前再命中被抑制 */
    @TableField("cooldown_until")
    private OffsetDateTime cooldownUntil;

    @TableField("closed_at")
    private OffsetDateTime closedAt;

    @TableField("closed_by")
    private Long closedBy;

    @TableField("closed_reason")
    private String closedReason;

    @TableField("transferred_to")
    private String transferredTo;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
