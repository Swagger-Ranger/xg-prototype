package com.xg.platform.knowledge.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName(value = "knowledge_qa", autoResultMap = true)
public class KnowledgeQa extends BaseEntity {

    @TableField("user_id")
    private Long userId;

    @TableField("question")
    private String question;

    @TableField("answer")
    private String answer;

    /**
     * JSONB stored as String
     */
    @TableField(value = "sources", typeHandler = JsonbTypeHandler.class)
    private String sources;

    @TableField("category")
    private String category;

    @TableField("helpful")
    private Boolean helpful;
}
