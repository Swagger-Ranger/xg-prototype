package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 辅导员审核学生人工销假申请。 */
@Data
public class ManualReturnReviewRequest {
    @NotNull(message = "approve 必填")
    private Boolean approve;
}
