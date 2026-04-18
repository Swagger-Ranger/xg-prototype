package com.xg.business.leave.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName(value = "leave_type_config", autoResultMap = true)
public class LeaveTypeConfig extends BaseEntity {

    @TableField("code")
    private String code;

    @TableField("name")
    private String name;

    @TableField("parent_code")
    private String parentCode;

    /**
     * JSONB stored as String
     */
    @TableField(value = "extra_fields", typeHandler = JsonbTypeHandler.class)
    private String extraFields;

    @TableField("require_attachment")
    private Boolean requireAttachment;

    @TableField("max_days")
    private Integer maxDays;

    @TableField("enabled")
    private Boolean enabled;

    @TableField("sort_order")
    private Integer sortOrder;
}
