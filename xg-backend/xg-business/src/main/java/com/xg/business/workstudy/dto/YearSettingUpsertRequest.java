package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class YearSettingUpsertRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{4}-\\d{4}$", message = "academic_year 形如 2024-2025")
    private String academicYear;

    @Min(0)
    private Integer maxFixedPerStudent;

    @Min(0)
    private Integer maxTempPerStudent;

    private Boolean applicationOpen;
    private Boolean defaultAllowSelfArrange;
}
