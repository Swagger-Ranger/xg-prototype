package com.xg.business.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.List;
import java.util.Map;

@Getter
@Setter
public class CreateActivityRequest {

    @NotBlank
    private String title;

    private List<Long> scopeOrgIds;

    private String checkinMode = "qr_scan";

    private Integer lateThresholdMinutes = 5;

    @NotNull
    private Integer durationMinutes;

    private Boolean enableCheckout;

    private Integer checkoutDurationMinutes;

    private Map<String, Object> geoFence;
}
