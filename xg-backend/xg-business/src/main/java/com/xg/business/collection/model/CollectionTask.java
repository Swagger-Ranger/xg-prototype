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
@TableName(value = "collection_task", autoResultMap = true)
public class CollectionTask extends BaseEntity {

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

    /**
     * BIGINT[] stored as String
     */
    @TableField("scope_org_ids")
    private String scopeOrgIds;

    @TableField("deadline")
    private OffsetDateTime deadline;

    @TableField("status")
    private String status;
}
