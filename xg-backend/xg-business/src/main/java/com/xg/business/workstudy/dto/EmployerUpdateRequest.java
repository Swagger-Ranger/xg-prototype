package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class EmployerUpdateRequest {

    @Size(max = 200)
    private String name;

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

    @Size(max = 2000)
    private String remark;
}
