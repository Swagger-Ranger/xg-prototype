package com.xg.business.complaint.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ReplyComplaintRequest {

    @NotBlank
    @Size(max = 2000)
    private String replyContent;
}
