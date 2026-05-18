package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "work_study_year_setting", autoResultMap = true)
public class WorkStudyYearSetting extends BaseEntity {

    @TableField("academic_year")
    private String academicYear;

    @TableField("max_fixed_per_student")
    private Integer maxFixedPerStudent;

    @TableField("max_temp_per_student")
    private Integer maxTempPerStudent;

    @TableField("application_open")
    private Boolean applicationOpen;

    @TableField("default_allow_self_arrange")
    private Boolean defaultAllowSelfArrange;

    // 三阶段时间窗(V114) — 任一对 _start/_end 为 NULL 表示该阶段不限时段。
    @TableField("position_window_start")
    private OffsetDateTime positionWindowStart;

    @TableField("position_window_end")
    private OffsetDateTime positionWindowEnd;

    @TableField("application_window_start")
    private OffsetDateTime applicationWindowStart;

    @TableField("application_window_end")
    private OffsetDateTime applicationWindowEnd;

    @TableField("salary_window_start")
    private OffsetDateTime salaryWindowStart;

    @TableField("salary_window_end")
    private OffsetDateTime salaryWindowEnd;
}
