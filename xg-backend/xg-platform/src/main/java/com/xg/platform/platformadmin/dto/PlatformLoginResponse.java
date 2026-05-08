package com.xg.platform.platformadmin.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlatformLoginResponse {

    private String token;
    private PlatformAdminView admin;
}
