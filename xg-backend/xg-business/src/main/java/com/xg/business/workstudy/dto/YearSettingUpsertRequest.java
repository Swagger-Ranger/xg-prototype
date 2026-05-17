package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

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

    // 三阶段时间窗(V114)。任一对 _start/_end 为 null = 该阶段不限时段。
    private OffsetDateTime positionWindowStart;
    private OffsetDateTime positionWindowEnd;
    private OffsetDateTime applicationWindowStart;
    private OffsetDateTime applicationWindowEnd;
    private OffsetDateTime salaryWindowStart;
    private OffsetDateTime salaryWindowEnd;
}
