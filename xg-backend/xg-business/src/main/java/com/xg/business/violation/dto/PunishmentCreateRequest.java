package com.xg.business.violation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class PunishmentCreateRequest {

    private Long violationRecordId;

    @NotNull
    private Long studentId;

    @NotBlank
    @Size(max = 100)
    private String studentName;

    @NotBlank
    @Size(max = 32)
    private String level;

    @NotBlank
    @Size(max = 2000)
    private String reason;

    @NotNull
    private LocalDate effectiveDate;

    private LocalDate expiryDate;
}
