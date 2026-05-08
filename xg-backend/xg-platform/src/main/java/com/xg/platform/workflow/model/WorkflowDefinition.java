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
@TableName(value = "workflow_definition", autoResultMap = true)
public class WorkflowDefinition extends BaseEntity {

    private String code;

    private String name;

    private Integer version;

    @TableField(value = "config_yaml")
    private String configYaml;

    @TableField(value = "config_json", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> configJson;

    private String status;  // draft / published / disabled

    private String module;

    @TableField("biz_type")
    private String bizType;

    /**
     * A.1 多 YAML 同 bizType 模型：NULL = 全校默认；非 NULL = 仅该 college_id
     * 的学生匹配。WorkflowEngine 解析时先按 (bizType, collegeId) 匹配，
     * 缺失再回落 (bizType, NULL)。
     */
    @TableField("college_id")
    private Long collegeId;
}
