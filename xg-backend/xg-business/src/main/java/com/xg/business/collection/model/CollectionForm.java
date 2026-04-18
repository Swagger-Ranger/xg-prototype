package com.xg.business.collection.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "collection_form", autoResultMap = true)
public class CollectionForm extends BaseEntity {

    @TableField("title")
    private String title;

    @TableField("description")
    private String description;

    /**
     * JSONB stored as String
     */
    @TableField(value = "fields", typeHandler = JsonbTypeHandler.class)
    private String fields;

    @TableField("creator_id")
    private Long creatorId;

    @TableField("scope_type")
    private String scopeType;

    /**
     * BIGINT[] stored as String
     */
    @TableField("scope_org_ids")
    private String scopeOrgIds;

    @TableField("status")
    private String status;

    @TableField("deadline")
    private OffsetDateTime deadline;

    @TableField("allow_edit")
    private Boolean allowEdit;

    @TableField("task_id")
    private Long taskId;

    @TableField("source_form_id")
    private Long sourceFormId;
}
