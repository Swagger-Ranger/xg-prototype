package com.xg.business.org.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CounselorMappingRequest {
    @NotNull
    private Long counselorId;
    @NotNull
    private Long orgId;
    /** 默认 false（副辅导员）。 */
    private Boolean isPrimary;
}
