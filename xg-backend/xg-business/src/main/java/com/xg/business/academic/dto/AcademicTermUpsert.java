package com.xg.business.academic.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class AcademicTermUpsert {

    @NotBlank
    @Size(max = 32)
    private String code;

    @NotBlank
    private String name;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    @NotNull
    private Integer totalWeeks;

    /** Whether this term should be marked current. Service ensures only one current per tenant. */
    private Boolean isCurrent;
}
