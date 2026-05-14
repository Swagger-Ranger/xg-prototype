package com.xg.business.dataimport.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateSessionRequest {

    /** student / teacher / counselor */
    @NotBlank
    @Pattern(regexp = "student|teacher|counselor")
    private String scenario;

    /** 用户在 Step 1 用一句话说的意图，可选 */
    private String intentText;
}
