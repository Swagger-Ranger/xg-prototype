package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

/** POST /system/roles/{code}/perms 批量授权 body。 */
@Getter
@Setter
public class GrantRolePermsRequest {
    private List<String> permCodes;
}
