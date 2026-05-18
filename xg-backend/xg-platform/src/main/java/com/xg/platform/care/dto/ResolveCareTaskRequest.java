package com.xg.platform.care.dto;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResolveCareTaskRequest {

    /** 完成备注（可选） */
    @Size(max = 1000)
    private String note;
}
