package com.xg.platform.care.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * AI brief 历史：append-only。
 * care_task.current_brief_id 指向最新可用版本；任务关闭后保留不删，作为规则改进证据。
 */
@Getter
@Setter
@TableName(value = "task_ai_brief_history", autoResultMap = true)
public class TaskAiBriefHistory {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("task_id")
    private Long taskId;

    @TableField(value = "brief", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> brief;

    @TableField("generated_at")
    private OffsetDateTime generatedAt;

    @TableField("generation_trigger")
    private String generationTrigger;

    @TableField("prompt_version")
    private String promptVersion;

    @TableField("llm_model")
    private String llmModel;

    @TableField("sanitize_result")
    private String sanitizeResult;
}
