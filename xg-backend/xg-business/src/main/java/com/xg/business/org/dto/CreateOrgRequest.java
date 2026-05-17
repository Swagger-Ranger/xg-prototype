package com.xg.business.org.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 新建组织节点请求。P0 UI 只暴露 college(顶层),class 走数据导入。
 *
 * <p>parentId 为 null = 顶层 college;非 null = 上级 id。
 * 后端会校验 parent 存在 + 类型组合合法(college 可顶层或在 college 下)。
 */
@Data
public class CreateOrgRequest {

    @NotBlank
    @Size(max = 100)
    private String name;

    /** 'college' / 'class' / 'admin_dept'。P0 前端只传 'college'。 */
    @NotBlank
    @Pattern(regexp = "^(college|class|admin_dept)$",
             message = "type 只能是 college / class / admin_dept")
    private String type;

    /** 上级 id;college 顶层时为 null。 */
    private Long parentId;

    /** 学院/班级编码,选填,主要给导入 / 报表对接用。 */
    @Size(max = 64)
    private String code;
}
