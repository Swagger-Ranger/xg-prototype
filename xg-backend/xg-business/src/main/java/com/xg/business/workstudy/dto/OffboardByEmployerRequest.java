package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * Employer-initiated offboarding payload.
 *
 * <p>{@code reason} is one of {@code completed} (任期到期) / {@code terminated_by_employer}
 * (单位终止). Omitted / unknown values default to {@code terminated_by_employer} on the
 * service side. {@code note} is the free-text reason.
 *
 * <p>{@code dismissalCategory} is only meaningful when reason resolves to
 * {@code terminated_by_employer}: one of {@code performance / discipline /
 * position_dissolved / mismatch / other}. It feeds the 主动关怀 R011 rule —
 * {@code position_dissolved} and {@code mismatch} suppress the alert while
 * {@code discipline} promotes it to 紧急.
 */
@Getter
@Setter
public class OffboardByEmployerRequest {

    @Size(max = 32)
    private String reason;

    @Size(max = 32)
    private String dismissalCategory;

    @Size(max = 2000)
    private String note;
}
