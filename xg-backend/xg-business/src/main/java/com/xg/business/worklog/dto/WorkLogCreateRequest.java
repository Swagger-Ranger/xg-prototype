package com.xg.business.worklog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.util.Map;

@Getter
@Setter
public class WorkLogCreateRequest {

    @NotBlank
    @Size(max = 32)
    private String category;

    @NotBlank
    @Size(max = 200)
    private String title;

    @NotBlank
    @Size(max = 4000)
    private String content;

    private Map<String, Object> data;

    @NotNull
    private LocalDate logDate;
}
