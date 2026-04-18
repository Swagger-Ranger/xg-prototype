package com.xg.business.violation.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
@TableName(value = "punishment", autoResultMap = true)
public class Punishment extends BaseEntity {

    @TableField("violation_record_id")
    private Long violationRecordId;

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("level")
    private String level;

    @TableField("reason")
    private String reason;

    @TableField("effective_date")
    private LocalDate effectiveDate;

    @TableField("expiry_date")
    private LocalDate expiryDate;

    @TableField("status")
    private String status;

    @TableField("issuer_id")
    private Long issuerId;

    @TableField("issuer_name")
    private String issuerName;
}
