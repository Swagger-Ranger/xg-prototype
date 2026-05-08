package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TimesheetDisputeRequest {

    @NotBlank
    @Size(max = 2000)
    private String note;
}
