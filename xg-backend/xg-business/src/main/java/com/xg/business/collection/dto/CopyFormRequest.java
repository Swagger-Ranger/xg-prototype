package com.xg.business.collection.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.List;

@Getter
@Setter
public class CopyFormRequest {

    @NotBlank
    private String title;

    private OffsetDateTime deadline;

    private List<Long> scopeOrgIds;
}
