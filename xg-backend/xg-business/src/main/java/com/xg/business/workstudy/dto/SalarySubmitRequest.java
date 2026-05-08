package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 用工单位申报某学生在某月的薪资。
 * units 单位由 position.salary_unit 决定（hour/day/month/per_task），
 * 系统按 position.salary_amount × units 计算 amount。
 */
@Getter
@Setter
public class SalarySubmitRequest {

    @NotNull
    private Long applicationId;          // 必须是 status=hired 的申请

    @NotBlank
    @Pattern(regexp = "^\\d{4}-\\d{2}$", message = "month 必须为 yyyy-MM")
    private String month;

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal units;            // 小时数 / 天数 / 月数 / 次数

    @Size(max = 1000)
    private String reportNote;
}
