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
}
