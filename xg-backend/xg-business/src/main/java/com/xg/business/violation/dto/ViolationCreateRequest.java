package com.xg.business.violation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
public class ViolationCreateRequest {

    @NotNull
    private Long studentId;

    @NotBlank
    @Size(max = 100)
    private String studentName;

    @NotBlank
    @Size(max = 32)
    private String category;

    @NotNull
    private OffsetDateTime occurredAt;

    @Size(max = 200)
    private String location;

    @NotBlank
    @Size(max = 2000)
    private String description;
}
