package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * 转介请求。targetDept 枚举对应 PRD §16.2：
 * counseling_center / aid_office / academic_affairs / security。
 */
@Getter
@Setter
public class TransferCareTaskRequest {

    @NotBlank
    @Pattern(regexp = "counseling_center|aid_office|academic_affairs|security",
            message = "转介目标部门无效")
    private String targetDept;

    @NotBlank(message = "转介必须填写说明")
    @Size(max = 1000)
    private String reasonDetail;
}
