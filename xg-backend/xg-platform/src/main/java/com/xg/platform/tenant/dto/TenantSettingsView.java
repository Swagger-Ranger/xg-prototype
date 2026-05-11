package com.xg.platform.tenant.dto;

import lombok.Data;

/**
 * Read-side view of a tenant's settings — what the front-end / dashboard
 * needs to know about the school it's running for.
 */
@Data
public class TenantSettingsView {

    private String tenantId;

    /** Display name of the school — single editable label that shows up in
     *  topbar / login / docs. Stored as {@code tenant.name}. */
    private String schoolName;

    /** Chinese city name; aligns with WeatherClient's whitelist. */
    private String schoolCity;

    /**
     * 是否启用书院制(双轨视图)。来自 tenant_settings.enable_residential_track。
     * 缺省 false → 学院单轨,行为跟启用前完全一样。开 true 后:学生信息页多一组
     * 「书院 / 楼栋」filter 与列;请假 / 违纪等审批走双辅导员体系。
     */
    private boolean enableResidentialTrack;
}
