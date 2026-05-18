package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

/** 启停单条内置规则（PRD §6.3）。 */
@Getter
@Setter
public class RuleToggleRequest {

    @NotNull
    private Boolean enabled;
}
