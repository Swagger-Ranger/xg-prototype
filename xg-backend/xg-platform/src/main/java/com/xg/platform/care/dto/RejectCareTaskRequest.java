package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * 拒绝任务必填原因；reason_code 枚举对应 PRD §10.3。
 */
@Getter
@Setter
public class RejectCareTaskRequest {

    @NotBlank
    @Pattern(regexp = "rule_not_applicable|student_special_case|handled_offline|already_transferred|other",
            message = "拒绝原因无效")
    private String reasonCode;

    @Size(max = 1000)
    private String reasonDetail;
}
