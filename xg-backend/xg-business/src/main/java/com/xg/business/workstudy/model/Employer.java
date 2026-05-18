package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@TableName(value = "employer", autoResultMap = true)
public class Employer extends BaseEntity {

    @TableField("name")
    private String name;

    @TableField("leader_user_id")
    private Long leaderUserId;

    @TableField(value = "operator_user_ids", typeHandler = JsonbTypeHandler.class)
    private String operatorUserIds;

    @TableField("contact_name")
    private String contactName;

    @TableField("contact_phone")
    private String contactPhone;

    @TableField("email")
    private String email;

    @TableField("status")
    private String status;

    @TableField("allow_self_arrange")
    private Boolean allowSelfArrange;

    /** 月薪酬发放上限(元);NULL=不限。WorkStudySalaryService.submit 时累计校验。 */
    @TableField("monthly_salary_cap")
    private BigDecimal monthlySalaryCap;

    @TableField("remark")
    private String remark;
}
