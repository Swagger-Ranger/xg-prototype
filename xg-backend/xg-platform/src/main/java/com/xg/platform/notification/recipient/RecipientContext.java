package com.xg.platform.notification.recipient;

import java.util.List;

/**
 * Orchestrator.send 时业务侧传入的"上下文" — 给各 RecipientTypeResolver 解析
 * 模板配置的 recipients 时使用。
 *
 * <p>P0 字段:
 * <ul>
 *   <li>applicantId — 申请人 user_id(几乎所有 type 都依赖它)</li>
 *   <li>currentApproverIds — 当前节点的审批人(WORKFLOW_TASK_ARRIVED 时由
 *       TaskAssignedNotifier 传入)</li>
 * </ul>
 *
 * <p>未来加 type 时(如 applicant_parent / class_advisor),按需扩字段。
 */
public final class RecipientContext {

    private final Long applicantId;
    private final List<Long> currentApproverIds;

    private RecipientContext(Long applicantId, List<Long> currentApproverIds) {
        this.applicantId = applicantId;
        this.currentApproverIds = currentApproverIds == null ? List.of() : List.copyOf(currentApproverIds);
    }

    public Long applicantId() { return applicantId; }
    public List<Long> currentApproverIds() { return currentApproverIds; }

    public static Builder builder() { return new Builder(); }

    /** 简便构造:大部分通知只有 applicant。 */
    public static RecipientContext applicant(Long applicantId) {
        return new RecipientContext(applicantId, null);
    }

    public static final class Builder {
        private Long applicantId;
        private List<Long> currentApproverIds;

        public Builder applicant(Long id) { this.applicantId = id; return this; }
        public Builder currentApprovers(List<Long> ids) { this.currentApproverIds = ids; return this; }

        public RecipientContext build() {
            return new RecipientContext(applicantId, currentApproverIds);
        }
    }
}
