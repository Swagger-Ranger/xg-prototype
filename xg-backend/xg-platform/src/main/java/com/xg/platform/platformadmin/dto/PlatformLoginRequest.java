package com.xg.platform.platformadmin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlatformLoginRequest {

    @NotBlank
    private String username;

    @NotBlank
    private String password;
}
