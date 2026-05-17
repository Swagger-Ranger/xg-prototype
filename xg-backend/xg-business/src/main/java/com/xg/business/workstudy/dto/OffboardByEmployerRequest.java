package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * Employer-initiated offboarding payload.
 *
 * <p>{@code reason} is one of {@code completed} (任期到期) / {@code terminated_by_employer}
 * (单位终止). Omitted / unknown values default to {@code terminated_by_employer} on the
 * service side. {@code note} is the free-text reason; AI may later auto-classify it.
 */
@Getter
@Setter
public class OffboardByEmployerRequest {

    @Size(max = 32)
    private String reason;

    @Size(max = 2000)
    private String note;
}
