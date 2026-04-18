package com.xg.platform.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AskQuestionRequest {

    @NotBlank
    @Size(max = 500)
    private String question;
}
