package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * 关怀任务反馈入口（PRD §10.3 / §14.1）。reject 流程已单独写
 * {@code rejected_reason}，本入口只收 false_positive / improvement_suggestion，
 * 喂回 30 天规则效果报表。
 */
@Getter
@Setter
public class CareFeedbackRequest {

    @NotBlank
    @Pattern(regexp = "false_positive|improvement_suggestion", message = "反馈类型无效")
    private String feedbackType;

    @Size(max = 32)
    private String reasonCode;

    @Size(max = 1000)
    private String reasonDetail;
}
