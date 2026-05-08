package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "work_study_position", autoResultMap = true)
public class WorkStudyPosition extends BaseEntity {

    @TableField("workflow_instance_id")
    private Long workflowInstanceId;

    @TableField("title")
    private String title;

    @TableField("position_type")
    private String positionType;

    @TableField("department_name")
    private String departmentName;

    @TableField("description")
    private String description;

    @TableField("requirements")
    private String requirements;

    @TableField("prefer_financial_aid")
    private Boolean preferFinancialAid;

    @TableField("hourly_rate")
    private BigDecimal hourlyRate;

    @TableField("weekly_hours")
    private Integer weeklyHours;

    @TableField("headcount")
    private Integer headcount;

    @TableField("hired_count")
    private Integer hiredCount;

    @TableField("status")
    private String status;

    @TableField("start_date")
    private LocalDate startDate;

    @TableField("end_date")
    private LocalDate endDate;

    @TableField("creator_id")
    private Long creatorId;

    // === V051 expansion ===

    @TableField("employer_id")
    private Long employerId;

    @TableField("academic_year")
    private String academicYear;

    @TableField("owner_user_id")
    private Long ownerUserId;

    @TableField("owner_phone")
    private String ownerPhone;

    @TableField("campus")
    private String campus;

    @TableField("work_location")
    private String workLocation;

    @TableField("duration_months")
    private Integer durationMonths;

    /** JSONB: [{"day":"mon","start":"14:00","end":"17:00"}] */
    @TableField(value = "time_slots", typeHandler = JsonbTypeHandler.class)
    private String timeSlots;

    @TableField("application_deadline")
    private OffsetDateTime applicationDeadline;

    /** hour / day / month / per_task */
    @TableField("salary_unit")
    private String salaryUnit;

    @TableField("salary_amount")
    private BigDecimal salaryAmount;

    @TableField("reason")
    private String reason;

    /** male / female / null=不限 */
    @TableField("gender_limit")
    private String genderLimit;

    /** JSONB: ["special","difficult","mild","none"] */
    @TableField(value = "aid_levels", typeHandler = JsonbTypeHandler.class)
    private String aidLevels;

    /** JSONB: ["2023","2024"] */
    @TableField(value = "grade_limits", typeHandler = JsonbTypeHandler.class)
    private String gradeLimits;

    /** JSONB: [collegeId,...] */
    @TableField(value = "college_limits", typeHandler = JsonbTypeHandler.class)
    private String collegeLimits;

    @TableField("self_arranged")
    private Boolean selfArranged;
}
