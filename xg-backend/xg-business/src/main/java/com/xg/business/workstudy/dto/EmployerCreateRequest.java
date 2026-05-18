package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

@Getter
@Setter
public class EmployerCreateRequest {

    @NotBlank
    @Size(max = 200)
    private String name;

    @NotNull
    private Long leaderUserId;

    private List<Long> operatorUserIds;

    @Size(max = 100)
    private String contactName;

    @Size(max = 32)
    private String contactPhone;

    @Email
    @Size(max = 128)
    private String email;

    private Boolean allowSelfArrange;

    /** 月薪酬发放上限(元);null=不限。 */
    @DecimalMin(value = "0.00", message = "上限不能为负")
    private BigDecimal monthlySalaryCap;

    @Size(max = 2000)
    private String remark;
}
