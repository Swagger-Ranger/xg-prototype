package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@Setter
public class PositionCreateRequest {

    @NotBlank
    @Size(max = 200)
    private String title;

    @Size(max = 16)
    private String positionType;

    @NotBlank
    @Size(max = 100)
    private String departmentName;

    @NotBlank
    @Size(max = 4000)
    private String description;

    @Size(max = 2000)
    private String requirements;

    private Boolean preferFinancialAid;

    @NotNull
    @DecimalMin("0.00")
    private BigDecimal hourlyRate;

    @Min(1)
    private Integer weeklyHours;

    @Min(1)
    private Integer headcount;

    private LocalDate startDate;
    private LocalDate endDate;
}
