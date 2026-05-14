package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * 用人单位"自服务"修改：employer 角色（leader / operator）可改自己单位的联系信息。
 * 不含 name / leaderUserId / operatorUserIds / allowSelfArrange / status — 这些归学工处 / 校管理员。
 */
@Getter
@Setter
public class EmployerSelfUpdateRequest {

    @Size(max = 100)
    private String contactName;

    @Size(max = 32)
    private String contactPhone;

    @Email
    @Size(max = 128)
    private String email;

    @Size(max = 2000)
    private String remark;
}
