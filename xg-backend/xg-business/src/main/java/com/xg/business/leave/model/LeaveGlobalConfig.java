package com.xg.business.leave.model;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * 租户级全局请假策略,V096 迁移落表 leave_global_config(tenant_id PK)。
 * 单行记录;getter 返回的 termMaxDays==null 视为「不限」。
 */
@Getter
@Setter
public class LeaveGlobalConfig {
    private String tenantId;
    /** 本学期所有假别累计请假上限(可半天)。null = 不限。 */
    private BigDecimal termMaxDays;
    /** 是否要求学生请假时上传证明材料。null/false = 不强制;true = 必填。 */
    private Boolean requireProof;
    private OffsetDateTime updatedAt;
    private Long updatedBy;
}
