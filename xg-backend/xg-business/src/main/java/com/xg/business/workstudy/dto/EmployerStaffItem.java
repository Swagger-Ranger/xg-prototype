package com.xg.business.workstudy.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

/**
 * 用人单位「可被指定为岗位负责人」的人员条目（leader + operators）。
 * 给前端 OwnerUserSelect 渲染下拉用，避免用户手填 user_id。
 */
@Getter
@Setter
@AllArgsConstructor
public class EmployerStaffItem {

    /** sys_user.id */
    private Long userId;

    /** 显示名：优先 real_name，缺省 username */
    private String name;

    /** "leader" | "operator" */
    private String role;
}
