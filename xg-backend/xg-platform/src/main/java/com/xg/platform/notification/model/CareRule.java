package com.xg.platform.notification.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 关怀规则 — CareScheduler / CareDispatcher 按 trigger_event + match_jsonb 命中,
 * 命中后按 template_code 通过 Orchestrator 发关怀通知。
 *
 * <p>match_jsonb 受限 DSL(P0):
 * <ul>
 *   <li><code>leave_type</code> — 等于(string)</li>
 *   <li><code>status_in</code> — 数组成员判定(["approved", ...])</li>
 *   <li><code>destination_city_not_empty</code> — true 时要求 form_data.destination_city 非空</li>
 * </ul>
 */
@Getter
@Setter
@TableName(value = "care_rule", autoResultMap = true)
public class CareRule {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    private String code;

    @TableField("biz_module")
    private String bizModule;

    /** before_event / after_event / on_event */
    @TableField("trigger_type")
    private String triggerType;

    /** leave_start / leave_end / leave_approved / sick_apply / ... */
    @TableField("trigger_event")
    private String triggerEvent;

    /** before_event 用负值(-24=提前一天);on_event 为 0 */
    @TableField("offset_hours")
    private Integer offsetHours;

    @Getter(AccessLevel.NONE)
    @TableField(value = "match_jsonb", typeHandler = JsonbTypeHandler.class)
    private String matchJsonb;

    public String getMatchJsonb() {
        return matchJsonb;
    }

    @TableField("template_code")
    private String templateCode;

    @TableField("data_resolver")
    private String dataResolver;

    private Boolean enabled;

    private String description;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
