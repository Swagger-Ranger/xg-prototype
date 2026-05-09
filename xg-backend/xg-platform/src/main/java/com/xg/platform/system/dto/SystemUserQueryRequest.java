package com.xg.platform.system.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SystemUserQueryRequest extends PageQuery {
    private String keyword;
    private String status;
    private String roleCode;
    /**
     * 缺省 false → 列表只显示非学生（教职工 + 外部）。设 true 用于
     * "按学号查学生账号"等兜底场景（学生量大时不应该默认混进来）。
     */
    private boolean includeStudents = false;
}
