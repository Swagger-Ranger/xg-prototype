package com.xg.platform.workflow.model;

import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.OffsetDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("task_instance")
public class TaskInstance extends BaseEntity {

    private Long workflowInstanceId;

    private String nodeId;

    private String nodeName;

    private Long assigneeId;

    private String status;  // pending / approved / rejected / skipped

    private String comment;

    private OffsetDateTime dueAt;

    private OffsetDateTime assignedAt;

    private OffsetDateTime completedAt;

    private Long decisionDurationMs;
}
