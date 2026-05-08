package com.xg.business.leave.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonRawValue;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;

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
    @Getter(AccessLevel.NONE)
    @TableField(value = "form_data", typeHandler = JsonbTypeHandler.class)
    private String formData;

    /**
     * JSONB stored as String
     */
    @Getter(AccessLevel.NONE)
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

    @TableField("apply_latitude")
    private BigDecimal applyLatitude;

    @TableField("apply_longitude")
    private BigDecimal applyLongitude;

    @TableField("apply_location_at")
    private OffsetDateTime applyLocationAt;

    @TableField("return_latitude")
    private BigDecimal returnLatitude;

    @TableField("return_longitude")
    private BigDecimal returnLongitude;

    @TableField("return_location_at")
    private OffsetDateTime returnLocationAt;

    /** 销假来源:gps / manual_approve / manual_force / access_card */
    @TableField("return_source")
    private String returnSource;

    /** 学生申请人工销假理由(GPS 不在围栏时的兜底通道)。 */
    @TableField("manual_return_reason")
    private String manualReturnReason;

    /** 学生申请人工销假上传的附件数组(JSONB)。 */
    @Getter(AccessLevel.NONE)
    @TableField(value = "manual_return_attachments", typeHandler = JsonbTypeHandler.class)
    private String manualReturnAttachments;

    @TableField("manual_return_submitted_at")
    private OffsetDateTime manualReturnSubmittedAt;

    /** Bitmask of reminders already fired (1=start, 2=pre_end, 4=due, 8=overdue). */
    @TableField("reminder_sent_mask")
    private Integer reminderSentMask;

    /**
     * JSONB stored as String
     */
    @Getter(AccessLevel.NONE)
    @TableField(value = "ai_draft", typeHandler = JsonbTypeHandler.class)
    private String aiDraft;

    @JsonRawValue
    public String getFormData() {
        return (formData == null || formData.isEmpty()) ? null : formData;
    }

    @JsonRawValue
    public String getAttachments() {
        return (attachments == null || attachments.isEmpty()) ? null : attachments;
    }

    @JsonRawValue
    public String getAiDraft() {
        return (aiDraft == null || aiDraft.isEmpty()) ? null : aiDraft;
    }

    @JsonRawValue
    public String getManualReturnAttachments() {
        return (manualReturnAttachments == null || manualReturnAttachments.isEmpty())
                ? null : manualReturnAttachments;
    }
}
