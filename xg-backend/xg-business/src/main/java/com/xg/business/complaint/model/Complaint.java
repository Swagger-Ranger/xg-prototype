package com.xg.business.complaint.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "complaint", autoResultMap = true)
public class Complaint extends BaseEntity {

    @TableField("title")
    private String title;

    @TableField("category")
    private String category;

    @TableField("content")
    private String content;

    @TableField("anonymous")
    private Boolean anonymous;

    @TableField("status")
    private String status;

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("handler_id")
    private Long handlerId;

    @TableField("handler_name")
    private String handlerName;

    @TableField("reply_content")
    private String replyContent;

    @TableField("reply_at")
    private OffsetDateTime replyAt;

    @TableField("satisfaction")
    private Integer satisfaction;
}
