package com.xg.platform.workflow.vo;

import lombok.Data;

import java.util.List;

/**
 * Approval-time visualization of a workflow instance's progress.
 * Returned by {@code GET /api/v1/workflows/instances/{id}/timeline}.
 *
 * <p>The timeline excludes {@code condition} nodes — their {@code when}
 * predicates are flattened onto the downstream node as
 * {@link TimelineNodeVO#getSkipLabel()} so the viewer sees a linear sequence.
 */
@Data
public class InstanceTimelineVO {
    private Long instanceId;
    private String bizType;
    /** running / completed / rejected / cancelled */
    private String status;
    private String currentNodeId;
    private List<TimelineNodeVO> nodes;
    private OutcomePreviewVO outcomePreview;
}
