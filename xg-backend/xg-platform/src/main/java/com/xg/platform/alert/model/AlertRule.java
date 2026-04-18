package com.xg.platform.alert.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
@TableName(value = "alert_rule", autoResultMap = true)
public class AlertRule extends BaseEntity {

    private String name;
    private String description;

    @TableField("rule_type")
    private String ruleType;

    @TableField(value = "config", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> config;

    private String severity;
    private Boolean enabled;
}
