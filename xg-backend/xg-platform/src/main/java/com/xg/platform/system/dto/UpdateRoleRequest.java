package com.xg.platform.system.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/**
 * 改自定义角色 / 团队基本信息。不允许改 code / is_builtin / kind。
 * team 字段在 kind='role' 行上传也无效(服务层会忽略)。
 */
@Data
public class UpdateRoleRequest {
    @NotBlank
    @Size(max = 64)
    private String name;

    @Size(max = 255)
    private String description;

    /** 仅 team:review / temporary / cross_dept / student_org / other,显式传 null 清空。 */
    private String teamType;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate endDate;
}
