package com.xg.platform.platformadmin.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.List;

@Getter
@Setter
public class PlatformAdminView {

    private String id;
    private String username;
    private String realName;
    private String phone;
    private String email;
    private String status;
    private OffsetDateTime lastLoginAt;
    private OffsetDateTime createdAt;

    /** Always {@code ["platform_super_admin"]} in P0 — kept as a list to mirror tenant-side CurrentUserView. */
    private List<String> roleCodes;
}
