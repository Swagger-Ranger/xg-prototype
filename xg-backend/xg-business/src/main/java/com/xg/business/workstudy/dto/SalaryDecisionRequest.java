package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SalaryDecisionRequest {

    /** approve / reject */
    @NotBlank
    @Pattern(regexp = "^(approve|reject)$")
    private String action;

    @Size(max = 2000)
    private String note;
}
