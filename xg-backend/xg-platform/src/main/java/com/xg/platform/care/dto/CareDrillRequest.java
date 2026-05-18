package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/** 下钻必填理由（PRD §13.2：不少于 30 字，写入审计）。 */
@Getter
@Setter
public class CareDrillRequest {

    @NotBlank
    @Size(min = 30, max = 1000, message = "下钻理由至少需 30 字")
    private String reason;
}
