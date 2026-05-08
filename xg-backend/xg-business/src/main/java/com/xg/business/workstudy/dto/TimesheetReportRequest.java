package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
public class TimesheetReportRequest {

    @NotNull
    private Long applicationId;

    @NotBlank
    @Pattern(regexp = "^\\d{4}-(0[1-9]|1[0-2])$", message = "月份格式应为 YYYY-MM")
    private String month;

    @NotNull
    @DecimalMin("0.0")
    @DecimalMax("744.0")
    private BigDecimal hoursReported;
}
