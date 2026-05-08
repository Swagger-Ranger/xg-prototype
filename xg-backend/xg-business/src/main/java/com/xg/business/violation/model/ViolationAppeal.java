package com.xg.business.violation.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "violation_appeal", autoResultMap = true)
public class ViolationAppeal extends BaseEntity {

    @TableField("violation_record_id")
    private Long violationRecordId;

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("reason")
    private String reason;

    @TableField("status")
    private String status;

    @TableField("resolver_id")
    private Long resolverId;

    @TableField("resolver_name")
    private String resolverName;

    @TableField("resolution_note")
    private String resolutionNote;

    @TableField("resolved_at")
    private OffsetDateTime resolvedAt;
}
