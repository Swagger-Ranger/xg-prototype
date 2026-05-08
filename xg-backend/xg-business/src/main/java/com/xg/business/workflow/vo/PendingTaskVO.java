package com.xg.business.workflow.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@Data
public class PendingTaskVO {
    private Long id;
    private Long workflowInstanceId;
    private String nodeId;
    private String nodeName;
    private Long assigneeId;
    private OffsetDateTime dueAt;
    private OffsetDateTime assignedAt;

    private String bizType;
    private Long bizId;
    private Long initiatorId;
    private String initiatorName;
    private OffsetDateTime startedAt;

    private String riskLevel;
    private List<String> reasons;
    private ApplicantStats applicantStats;

    private BigDecimal leaveDurationDays;
    private String leaveTypeName;
    private String leaveReason;
    private OffsetDateTime leaveStartTime;
    private OffsetDateTime leaveEndTime;
}
