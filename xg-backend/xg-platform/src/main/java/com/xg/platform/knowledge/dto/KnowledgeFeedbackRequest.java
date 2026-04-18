package com.xg.platform.knowledge.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class KnowledgeFeedbackRequest {

    @NotNull
    private Boolean helpful;
}
