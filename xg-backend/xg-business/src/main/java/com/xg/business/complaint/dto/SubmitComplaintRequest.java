package com.xg.business.complaint.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SubmitComplaintRequest {

    @NotBlank
    @Size(max = 100)
    private String title;

    @NotBlank
    @Size(max = 32)
    private String category;

    @NotBlank
    @Size(max = 2000)
    private String content;

    private Boolean anonymous = Boolean.FALSE;
}
