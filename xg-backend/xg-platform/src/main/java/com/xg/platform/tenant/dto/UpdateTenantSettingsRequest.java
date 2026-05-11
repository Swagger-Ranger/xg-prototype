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

    /**
     * 是否启用书院制双轨。null = 不改;true/false 写到 tenant_settings.enable_residential_track。
     * 关掉后所有书院相关 UI 自动隐藏(软隐藏:已配置的书院树和学生绑定不动,再开就回来)。
     */
    private Boolean enableResidentialTrack;
}
