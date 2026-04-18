package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LeaveProxyRequest extends LeaveApplyRequest {

    @NotNull
    private Long studentId;

    private String proxyReason;
}
