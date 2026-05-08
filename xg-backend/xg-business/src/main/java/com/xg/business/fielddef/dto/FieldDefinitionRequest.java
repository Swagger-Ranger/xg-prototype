package com.xg.business.fielddef.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class FieldDefinitionRequest {

    @NotBlank(message = "字段编码不能为空")
    @Pattern(regexp = "^[a-z][a-z0-9_]{1,62}$", message = "字段编码需以小写字母开头，可含字母/数字/下划线")
    private String code;

    @NotBlank(message = "字段名称不能为空")
    private String label;

    @NotBlank(message = "字段类型不能为空")
    @Pattern(regexp = "^(text|number|date|select|textarea)$", message = "字段类型取值非法")
    private String fieldType;

    /** select 类型的可选项 */
    private List<String> options;

    private String placeholder;

    private Boolean required;

    private Integer sortOrder;

    private Boolean enabled;
}
