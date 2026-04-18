package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.xg.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "workflow_definition", autoResultMap = true)
public class WorkflowDefinition extends BaseEntity {

    private String code;

    private String name;

    private Integer version;

    @TableField(value = "config_yaml")
    private String configYaml;

    @TableField(value = "config_json", typeHandler = JacksonTypeHandler.class)
    private Object configJson;

    private String status;  // draft / published / disabled

    private String module;
}
