package com.xg.platform.system.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * 「角色权限」/「团队管理」管理页用的角色摘要 DTO。
 *
 * <p>kind='role':传统角色摘要,关注 effective/override 权限数。
 * <p>kind='team':业务团队摘要,关注 teamType / 时间窗 / archivedAt / memberCount。
 */
@Getter
@Setter
public class RoleSummary {
    private Long id;
    private String code;
    private String name;
    private String description;
    private Boolean isBuiltin;
    private Integer sortOrder;

    /** 这个角色实际能用的权限码总数（DEFAULTS + DB override 去重后）。 */
    private Integer effectivePermCount;

    /** 仅 DB 表里挂的"额外"权限数（排除 DEFAULTS）。便于 UI 显示"自定义 N 项"角标。 */
    private Integer overridePermCount;

    /** 'role' | 'team'。 */
    private String kind;

    /** kind='team' 才有值:review / temporary / cross_dept / student_org / other。 */
    private String teamType;

    /** kind='team' 才有值。 */
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    private OffsetDateTime archivedAt;

    /** sys_user_role 行数:role 显示"绑定用户数",team 显示"成员数"。 */
    private Integer memberCount;
}
