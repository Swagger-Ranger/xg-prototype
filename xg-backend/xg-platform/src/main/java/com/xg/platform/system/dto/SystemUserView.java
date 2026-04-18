package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.List;

@Getter
@Setter
public class SystemUserView {
    private Long id;
    private String username;
    private String realName;
    private String phone;
    private String email;
    private List<String> roleCodes;
    private String status;
    private OffsetDateTime lastLoginAt;
    private OffsetDateTime createdAt;
}
