package com.xg.business.fielddef.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonRawValue;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName(value = "field_definition", autoResultMap = true)
public class FieldDefinition extends BaseEntity {

    @TableField("code")
    private String code;

    @TableField("label")
    private String label;

    @TableField("field_type")
    private String fieldType;

    /** JSONB array stored as String, e.g. ["A","B","AB","O"]; emitted as raw JSON array. */
    @TableField(value = "options", typeHandler = JsonbTypeHandler.class)
    @JsonRawValue
    private String options;

    @TableField("placeholder")
    private String placeholder;

    @TableField("required")
    private Boolean required;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("enabled")
    private Boolean enabled;
}
