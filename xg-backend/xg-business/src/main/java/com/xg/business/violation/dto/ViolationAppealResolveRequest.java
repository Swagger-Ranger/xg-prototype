package com.xg.business.violation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ViolationAppealResolveRequest {

    @NotBlank
    @Pattern(regexp = "upheld|rejected")
    private String outcome;

    @Size(max = 2000)
    private String note;
}
