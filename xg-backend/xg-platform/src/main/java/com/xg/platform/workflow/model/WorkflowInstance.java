package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.xg.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "workflow_instance", autoResultMap = true)
public class WorkflowInstance extends BaseEntity {

    private Long definitionId;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> definitionSnapshot;

    private Long initiatorId;

    private String currentNodeId;

    private String status;  // running / completed / rejected / cancelled

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> context;

    private String bizType;

    private Long bizId;

    private OffsetDateTime startedAt;

    private OffsetDateTime finishedAt;
}
