package com.xg.platform.system.dto;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class UpdateUserRequest {

    @Size(max = 64)
    private String realName;

    @Size(max = 32)
    private String phone;

    @Size(max = 128)
    private String email;

    private List<String> roleCodes;

    private String status;   // active, disabled
}
