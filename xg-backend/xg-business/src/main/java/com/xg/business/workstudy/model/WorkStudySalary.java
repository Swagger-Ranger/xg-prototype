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
@TableName(value = "work_study_salary", autoResultMap = true)
public class WorkStudySalary extends BaseEntity {

    @TableField("timesheet_id")
    private Long timesheetId;

    @TableField("student_id")
    private Long studentId;

    @TableField("position_id")
    private Long positionId;

    @TableField("month")
    private String month;

    @TableField("hours")
    private BigDecimal hours;

    @TableField("hourly_rate")
    private BigDecimal hourlyRate;

    @TableField("amount")
    private BigDecimal amount;

    @TableField("status")
    private String status;

    @TableField("confirmed_by")
    private Long confirmedBy;

    @TableField("confirmed_at")
    private OffsetDateTime confirmedAt;

    @TableField("paid_at")
    private OffsetDateTime paidAt;

    // === V055 expansion ===

    @TableField("workflow_instance_id")
    private Long workflowInstanceId;

    /** Snapshot of position.position_type (fixed / temporary). */
    @TableField("position_type")
    private String positionType;

    /** 本次申报的工作量（小时数 / 天数 / 月数 / 次数） */
    @TableField("units")
    private BigDecimal units;

    /** hour / day / month / per_task（来自 position.salary_unit） */
    @TableField("unit_type")
    private String unitType;

    @TableField("unit_rate")
    private BigDecimal unitRate;

    @TableField("reporter_id")
    private Long reporterId;

    @TableField("report_note")
    private String reportNote;

    /** Inlined position summary when caller asks for {@code include=position}. */
    @TableField(exist = false)
    private com.xg.business.workstudy.model.WorkStudyApplication.PositionSummary positionSummary;
}
