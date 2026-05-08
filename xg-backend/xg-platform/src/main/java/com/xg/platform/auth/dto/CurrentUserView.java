package com.xg.platform.auth.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class CurrentUserView {

    private String id;
    private String username;
    private String realName;
    private String avatarUrl;
    private String email;
    private String phone;
    /** male / female / unknown — backend stores English; UI translates. */
    private String gender;
    private String tenantId;
    private String tenantName;
    private String orgId;
    private String orgName;
    private List<String> roleCodes;
    private List<String> permissions;
}
