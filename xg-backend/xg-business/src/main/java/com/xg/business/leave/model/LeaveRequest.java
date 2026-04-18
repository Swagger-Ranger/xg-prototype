package com.xg.business.leave.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "leave_request", autoResultMap = true)
public class LeaveRequest extends BaseEntity {

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("leave_type_code")
    private String leaveTypeCode;

    @TableField("leave_type_name")
    private String leaveTypeName;

    @TableField("start_time")
    private OffsetDateTime startTime;

    @TableField("end_time")
    private OffsetDateTime endTime;

    @TableField("duration_days")
    private BigDecimal durationDays;

    @TableField("reason")
    private String reason;

    /**
     * JSONB stored as String
     */
    @TableField(value = "form_data", typeHandler = JsonbTypeHandler.class)
    private String formData;

    /**
     * JSONB stored as String
     */
    @TableField(value = "attachments", typeHandler = JsonbTypeHandler.class)
    private String attachments;

    @TableField("status")
    private String status;

    @TableField("workflow_instance_id")
    private Long workflowInstanceId;

    @TableField("submitted_by")
    private Long submittedBy;

    @TableField("is_proxy")
    private Boolean isProxy;

    @TableField("cancel_time")
    private OffsetDateTime cancelTime;

    @TableField("cancelled_by")
    private Long cancelledBy;

    /**
     * JSONB stored as String
     */
    @TableField(value = "ai_draft", typeHandler = JsonbTypeHandler.class)
    private String aiDraft;
}
