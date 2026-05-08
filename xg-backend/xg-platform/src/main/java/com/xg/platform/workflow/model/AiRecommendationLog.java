package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Captures the (AI suggestion, human decision) tuple on every approval
 * action. See V056 for column-level docs and agreement_state semantics.
 */
@Getter
@Setter
@TableName("ai_recommendation_log")
public class AiRecommendationLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("task_id")
    private Long taskId;

    @TableField("biz_type")
    private String bizType;

    @TableField("biz_id")
    private Long bizId;

    @TableField("ai_recommendation")
    private String aiRecommendation; // approve | caution | reject

    @TableField("ai_headline")
    private String aiHeadline;

    @TableField("ai_rationale")
    private String aiRationale;

    @TableField("ai_model")
    private String aiModel;

    @TableField("human_decision")
    private String humanDecision; // approve | reject

    @TableField("human_comment")
    private String humanComment;

    @TableField("approver_id")
    private Long approverId;

    @TableField("agreement_state")
    private String agreementState; // agree | disagree | unclear | no_ai

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
