package com.xg.business.org.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MappingPrimaryUpdateRequest {
    @NotNull
    private Boolean isPrimary;
}
