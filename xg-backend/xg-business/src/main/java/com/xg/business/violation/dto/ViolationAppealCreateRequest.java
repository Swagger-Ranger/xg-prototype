package com.xg.business.violation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ViolationAppealCreateRequest {

    @NotNull
    private Long violationRecordId;

    @NotBlank
    @Size(max = 2000)
    private String reason;
}
