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
@TableName(value = "collection_submission", autoResultMap = true)
public class CollectionSubmission extends BaseEntity {

    @TableField("form_id")
    private Long formId;

    @TableField("student_id")
    private Long studentId;

    /**
     * JSONB stored as String
     */
    @TableField(value = "data", typeHandler = JsonbTypeHandler.class)
    private String data;

    @TableField("status")
    private String status;

    @TableField("submitted_at")
    private OffsetDateTime submittedAt;
}
