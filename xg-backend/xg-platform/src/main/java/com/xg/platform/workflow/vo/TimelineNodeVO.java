package com.xg.platform.workflow.vo;

import lombok.Data;

import java.time.OffsetDateTime;

@Data
public class TimelineNodeVO {
    private String id;
    private String name;
    /** form_submit / approval / end (condition is dropped — flattened onto the downstream node) */
    private String type;
    /** completed / in_progress / pending */
    private String state;

    /** Set when state=completed. */
    private OffsetDateTime completedAt;
    /** Set when state=completed for approval nodes. approved / rejected. */
    private String decision;
    /** Set when state=completed. Decision elapsed wall time. */
    private Long durationMs;
    /** Set when state=completed for approval nodes. */
    private String comment;

    /** SLA target. Set when state=in_progress and the node had a timeout DSL. */
    private OffsetDateTime dueAt;

    /** Person responsible for this node. For form_submit, the initiator. For approval, the assignee. */
    private TimelineActorVO actor;

    /** Human-readable predicate that gates entry into this node, e.g. "请假超过 3 天才进入". */
    private String skipLabel;

    /** True if this node is the one the calling user is currently being asked to approve. */
    private boolean currentForViewer;
}
