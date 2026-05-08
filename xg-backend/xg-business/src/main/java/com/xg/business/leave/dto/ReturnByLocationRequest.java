package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** 学生小程序 GPS 销假入参。 */
@Data
public class ReturnByLocationRequest {
    @NotNull(message = "GPS 纬度必填")
    private BigDecimal latitude;
    @NotNull(message = "GPS 经度必填")
    private BigDecimal longitude;
    /** 客户端定位捕获时间(可选,服务器兜底取 NOW)。 */
    private OffsetDateTime capturedAt;
}
