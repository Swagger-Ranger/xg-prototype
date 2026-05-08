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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class PositionCreateRequest {

    @NotBlank
    @Size(max = 200)
    private String title;

    @Size(max = 16)
    private String positionType;

    /** Legacy free-text department; kept for backward compat. New code should set employerId. */
    @Size(max = 100)
    private String departmentName;

    @NotBlank
    @Size(max = 4000)
    private String description;

    @Size(max = 2000)
    private String requirements;

    private Boolean preferFinancialAid;

    /** Legacy field (元/小时). New code should use salaryUnit + salaryAmount. */
    @DecimalMin("0.00")
    private BigDecimal hourlyRate;

    @Min(1)
    private Integer weeklyHours;

    @Min(1)
    private Integer headcount;

    private LocalDate startDate;
    private LocalDate endDate;

    // === V051 expansion ===

    private Long employerId;

    @Size(max = 16)
    private String academicYear;

    private Long ownerUserId;

    @Size(max = 32)
    private String ownerPhone;

    @Size(max = 100)
    private String campus;

    @Size(max = 200)
    private String workLocation;

    @Min(1)
    private Integer durationMonths;

    /** [{day:"mon",start:"14:00",end:"17:00"}] */
    private List<Map<String, Object>> timeSlots;

    private OffsetDateTime applicationDeadline;

    /** hour / day / month / per_task */
    @Size(max = 16)
    private String salaryUnit;

    @DecimalMin("0.00")
    private BigDecimal salaryAmount;

    @Size(max = 1000)
    private String reason;

    /** male / female / null=不限 */
    @Size(max = 8)
    private String genderLimit;

    private List<String> aidLevels;
    private List<String> gradeLimits;
    private List<Long> collegeLimits;

    private Boolean selfArranged;
}
