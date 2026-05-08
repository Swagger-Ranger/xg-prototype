package com.xg.business.leave.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/** 校园围栏写入入参。 */
@Data
public class UpdateCampusGeofenceRequest {
    @NotNull
    private BigDecimal centerLat;
    @NotNull
    private BigDecimal centerLng;
    @NotNull
    @Min(value = 1, message = "半径至少 1 米")
    @Max(value = 100000, message = "半径不超过 100000 米")
    private Integer radiusM;
    /** 是否启用 GPS 销假。null 视为 true(向后兼容)。 */
    private Boolean enabled;
}
