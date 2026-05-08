package com.xg.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChangeMyPasswordRequest {

    @NotBlank(message = "请填写原密码")
    private String oldPassword;

    @NotBlank(message = "请填写新密码")
    @Size(min = 8, max = 64, message = "新密码长度需在 8-64 位之间")
    private String newPassword;
}
