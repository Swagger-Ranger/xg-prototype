package com.xg.business.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
public class ScanCheckinRequest {

    @NotNull
    private Long activityId;

    @NotBlank
    private String qrPayload;

    private Map<String, Object> location;
}
