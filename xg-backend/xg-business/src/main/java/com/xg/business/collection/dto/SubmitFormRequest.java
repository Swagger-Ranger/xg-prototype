package com.xg.business.collection.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
public class SubmitFormRequest {

    @NotNull
    private Map<String, Object> data;
}
