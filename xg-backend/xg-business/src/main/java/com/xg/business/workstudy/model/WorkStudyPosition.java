package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@Setter
@TableName(value = "work_study_position", autoResultMap = true)
public class WorkStudyPosition extends BaseEntity {

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
}
