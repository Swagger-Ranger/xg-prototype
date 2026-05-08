package com.xg.platform.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Self-service profile update. All fields nullable — only non-null fields are
 * applied, so the front-end can PATCH-style send just the diff. Sensitive
 * fields (username / real_name / role / password) are intentionally absent
 * and stay admin-managed.
 */
@Data
public class UpdateMyProfileRequest {

    @Email(message = "邮箱格式不正确")
    @Size(max = 200)
    private String email;

    /** Loose pattern — supports +86, hyphens, etc.; tighten in tenant policy if needed. */
    @Pattern(regexp = "^[+\\d\\-\\s]{6,32}$", message = "手机号格式不正确")
    private String phone;

    /** male / female / unknown — empty string clears the value. */
    private String gender;

    @Size(max = 500)
    private String avatarUrl;
}
