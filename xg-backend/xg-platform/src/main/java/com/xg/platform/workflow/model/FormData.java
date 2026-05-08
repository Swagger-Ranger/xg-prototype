package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "form_data", autoResultMap = true)
public class FormData extends BaseEntity {

    private Long workflowInstanceId;

    @TableField(typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> data;

    @TableField(typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> aiDraft;
}
