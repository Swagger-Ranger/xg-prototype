package com.xg.business.violation.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "violation_record", autoResultMap = true)
public class ViolationRecord extends BaseEntity {

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("category")
    private String category;

    @TableField("occurred_at")
    private OffsetDateTime occurredAt;

    @TableField("location")
    private String location;

    @TableField("description")
    private String description;

    @TableField("recorder_id")
    private Long recorderId;

    @TableField("recorder_name")
    private String recorderName;

    @TableField("punishment_id")
    private Long punishmentId;

    @TableField("approval_status")
    private String approvalStatus;

    @TableField("approver_id")
    private Long approverId;

    @TableField("approver_name")
    private String approverName;

    @TableField("approved_at")
    private OffsetDateTime approvedAt;

    @TableField("submitted_at")
    private OffsetDateTime submittedAt;

    @TableField("rejection_reason")
    private String rejectionReason;
}
