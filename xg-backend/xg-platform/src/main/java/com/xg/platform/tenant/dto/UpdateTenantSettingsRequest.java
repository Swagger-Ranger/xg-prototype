package com.xg.platform.tenant.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateTenantSettingsRequest {

    /** null = leave unchanged. Empty string is rejected (school must have a name). */
    @Size(min = 1, max = 200)
    private String schoolName;

    /** null = leave unchanged. Empty string clears the value. */
    @Size(max = 50)
    private String schoolCity;
}
