package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class LeaveApplyRequest {

    @NotBlank
    private String leaveTypeCode;

    @NotNull
    private OffsetDateTime startTime;

    @NotNull
    private OffsetDateTime endTime;

    @NotBlank
    private String reason;

    private List<Long> attachmentFileIds;

    private Map<String, Object> extraData;
}
