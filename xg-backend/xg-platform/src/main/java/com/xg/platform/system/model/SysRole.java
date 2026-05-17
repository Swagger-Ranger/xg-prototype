package com.xg.platform.system.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "sys_role", autoResultMap = true)
public class SysRole extends BaseEntity {

    @TableField("code")
    private String code;

    @TableField("name")
    private String name;

    @TableField("description")
    private String description;

    @TableField("is_builtin")
    private Boolean isBuiltin;

    @TableField("sort_order")
    private Integer sortOrder;

    /** 'role' = 角色权限页里的岗位定义;'team' = 团队管理页里的业务编组。
     *  详见 V116 migration 注释。 */
    @TableField("kind")
    private String kind;

    /** 仅 team 用:review / temporary / cross_dept / student_org / other。role 行恒为 NULL。 */
    @TableField("team_type")
    private String teamType;

    /** 仅 team 用:团队工作起止日期(可空)。两个都空 = 常驻。role 行恒为 NULL。 */
    @TableField("start_date")
    private LocalDate startDate;

    @TableField("end_date")
    private LocalDate endDate;

    /** 仅 team 用:归档时间(归档后 UI 隐藏在「已归档」分组里,但成员关系保留)。 */
    @TableField("archived_at")
    private OffsetDateTime archivedAt;
}
