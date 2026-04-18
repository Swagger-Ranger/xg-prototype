package com.xg.business.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SupplementRequest {

    @NotNull
    private Long studentId;

    @NotBlank
    private String note;
}
