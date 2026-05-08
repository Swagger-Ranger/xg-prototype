package com.xg.business.academic.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.time.LocalDate;

@Data
public class AcademicEventUpsert {

    /** Optional — winter / summer breaks may straddle terms. */
    private String termCode;

    @NotBlank
    private String eventType;

    @NotBlank
    private String name;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    @Pattern(regexp = "day|month")
    private String granularity;

    private String notes;
}
