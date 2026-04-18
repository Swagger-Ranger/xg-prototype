package com.xg.business.collection.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.List;

@Getter
@Setter
public class CreateFormRequest {

    @NotBlank
    private String title;

    private String description;

    /**
     * JSON array of field definitions
     */
    private String fields;

    private String scopeType;

    private List<Long> scopeOrgIds;

    private OffsetDateTime deadline;

    private Boolean allowEdit;
}
