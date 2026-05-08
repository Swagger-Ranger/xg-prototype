package com.xg.business.counselortalk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
public class CounselorTalkCreateRequest {

    @NotNull
    private Long studentId;

    @NotBlank
    @Size(max = 128)
    private String studentName;

    @NotBlank
    @Size(max = 32)
    private String topic;

    @NotBlank
    @Size(max = 5000)
    private String content;

    @Size(max = 2000)
    private String followUp;

    @NotNull
    private OffsetDateTime talkAt;

    /** Optional — when set, the alert is auto-acknowledged and linked back. */
    private Long sourceAlertId;
}
