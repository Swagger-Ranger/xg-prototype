package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.xg.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "form_data", autoResultMap = true)
public class FormData extends BaseEntity {

    private Long workflowInstanceId;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> data;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> aiDraft;
}
