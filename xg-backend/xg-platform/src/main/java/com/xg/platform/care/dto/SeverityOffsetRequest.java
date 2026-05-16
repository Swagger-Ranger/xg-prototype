package com.xg.platform.care.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

/** 全局严重度偏移（PRD §6.3，仅 -1 / 0 / +1）。 */
@Getter
@Setter
public class SeverityOffsetRequest {

    @NotNull
    @Min(-1)
    @Max(1)
    private Integer offset;
}
