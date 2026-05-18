package com.xg.platform.system.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class CreateUserRequest {

    @NotBlank
    @Size(min = 3, max = 64)
    @Pattern(regexp = "^[a-zA-Z0-9_.-]+$", message = "用户名仅支持字母/数字/下划线/点/短横线")
    private String username;

    @NotBlank
    @Size(max = 64)
    private String realName;

    @Size(max = 32)
    private String phone;

    @Size(max = 128)
    private String email;

    @NotEmpty
    private List<String> roleCodes;

    /**
     * 初始密码。可选 — 留空时服务端用 {@code SystemUserService.DEFAULT_PASSWORD} 兜底。
     * P0 默认走兜底(管理员不再每次手填),后续接 SSO / 强制首登改密时再回收。
     */
    @Size(min = 6, max = 64)
    private String password;
}
