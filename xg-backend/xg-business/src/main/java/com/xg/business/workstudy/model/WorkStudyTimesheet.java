package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "work_study_timesheet", autoResultMap = true)
public class WorkStudyTimesheet extends BaseEntity {

    @TableField("workflow_instance_id")
    private Long workflowInstanceId;

    @TableField("application_id")
    private Long applicationId;

    @TableField("student_id")
    private Long studentId;

    @TableField("position_id")
    private Long positionId;

    @TableField("month")
    private String month;

    @TableField("hours_reported")
    private BigDecimal hoursReported;

    @TableField("hours_confirmed")
    private BigDecimal hoursConfirmed;

    @TableField("hours_final")
    private BigDecimal hoursFinal;

    @TableField("student_confirmed_at")
    private OffsetDateTime studentConfirmedAt;

    @TableField("dispute_note")
    private String disputeNote;

    @TableField("finalize_note")
    private String finalizeNote;

    @TableField("status")
    private String status;

    @TableField("reporter_id")
    private Long reporterId;
}
