package com.xg.platform.system.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 新建角色或团队的统一请求体。
 *
 * <p>code 规则:
 * <ul>
 *   <li>kind='role':前端必填,服务端校验唯一</li>
 *   <li>kind='team':前端可不传,服务端从 name 派生(team_<slug>_<rand>)</li>
 * </ul>
 */
@Data
public class CreateRoleRequest {

    /** 角色 code,4-32 字符,仅小写字母 / 数字 / 下划线。team 可省。 */
    @Pattern(regexp = "^[a-z][a-z0-9_]{3,31}$",
             message = "code 必须以小写字母开头,仅包含 a-z / 0-9 / 下划线,长度 4-32")
    private String code;

    @NotBlank(message = "name 必填")
    @Size(max = 64)
    private String name;

    @Size(max = 255)
    private String description;

    /** 可选:初始权限码列表。后端去重并跳过 sys_permission 表里不存在的码(不报错)。 */
    private List<String> initialPermissionCodes;

    /** 可选:从某个已有角色复制权限(与 initialPermissionCodes 互斥时优先用后者)。 */
    private String copyFromRoleCode;

    /** 'role'(默认) | 'team'。 */
    private String kind;

    /** 仅 team:review / temporary / cross_dept / student_org / other。 */
    private String teamType;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate endDate;
}
