package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

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
}
