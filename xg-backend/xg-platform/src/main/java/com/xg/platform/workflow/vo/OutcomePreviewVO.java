package com.xg.platform.workflow.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Plain-text hints answering "if I approve / reject this task, where does the flow go?".
 * UI renders these directly under the node strip so an approver doesn't have to
 * mentally trace the YAML.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OutcomePreviewVO {
    /** e.g. "通过后进入 院领导审批". null if no current approval task. */
    private String onApprove;
    /** e.g. "驳回后流程结束". null if no current approval task. */
    private String onReject;
}
