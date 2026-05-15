package com.xg.platform.care.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 关怀任务反馈：辅导员拒绝 / 标记误报 / 改进建议。
 * 喂回 30 天规则效果报表，是规则方继续维护内置规则的关键依据。
 */
@Getter
@Setter
@TableName("care_task_feedback")
public class CareTaskFeedback {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("task_id")
    private Long taskId;

    @TableField("feedback_type")
    private String feedbackType;

    @TableField("reason_code")
    private String reasonCode;

    @TableField("reason_detail")
    private String reasonDetail;

    @TableField("submitted_by")
    private Long submittedBy;

    @TableField("submitted_at")
    private OffsetDateTime submittedAt;
}
