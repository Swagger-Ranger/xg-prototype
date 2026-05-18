package com.xg.platform.crisis.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 危机线索查看/关闭审计流水：append-only（设计 §5）。
 *
 * <p>与 {@link com.xg.platform.care.model.CareTaskAudit} 同范式，但<b>无状态迁移字段</b>
 * （crisis 不进 care 状态机，只有 view / close 两个动作），也<b>不复用 care_task_audit 表</b>
 * ——危机详情访问留痕要求比普通关怀更严，独立成表便于单独审计/导出。
 */
@Getter
@Setter
@TableName(value = "crisis_signal_audit", autoResultMap = true)
public class CrisisSignalAudit {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("signal_id")
    private Long signalId;

    /** view=打开危机详情；close=人工核实后关闭。 */
    private String action;

    /** 已认证查看/处理人（非传参，取 Sa-Token 身份）。 */
    @TableField("actor_id")
    private Long actorId;

    @TableField("actor_role")
    private String actorRole;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
