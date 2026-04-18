package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ApplicationCreateRequest {

    @NotNull
    private Long positionId;

    @Size(max = 16)
    private String financialAidLevel;

    @NotBlank
    @Size(max = 2000)
    private String intro;
}
