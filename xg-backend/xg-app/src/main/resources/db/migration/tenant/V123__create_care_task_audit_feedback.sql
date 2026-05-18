-- 主动关怀工作台 W2.1：审计 + 反馈
-- care_task_audit：状态机每次迁移强制写一条，等同业务关键事件审计流水
-- care_task_feedback：辅导员拒绝 / 标记误报时收集反馈，喂回规则效果报表

CREATE TABLE IF NOT EXISTS care_task_audit (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    task_id         BIGINT NOT NULL,
    action          VARCHAR(32) NOT NULL,             -- accept / reject / transfer / reschedule / resolve / overdue_tick / save_followup
    from_status     VARCHAR(16) NOT NULL,
    to_status       VARCHAR(16) NOT NULL,
    actor_id        BIGINT,                            -- 系统迁移（overdue_tick）时为 NULL
    actor_role      VARCHAR(32),
    payload         JSONB,                             -- 改期天数、转介目标、拒绝原因等动作上下文
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- 不放 deleted_at：审计 append-only
);

CREATE INDEX IF NOT EXISTS idx_care_audit_task ON care_task_audit(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_audit_tenant_action ON care_task_audit(tenant_id, action, created_at DESC);

COMMENT ON TABLE care_task_audit IS '关怀任务状态迁移流水（append-only），每次 CareTaskService.transition() 必写';
COMMENT ON COLUMN care_task_audit.actor_id IS '操作人；系统迁移（如 overdue_tick）为 NULL';
COMMENT ON COLUMN care_task_audit.payload IS '动作上下文：reschedule.days / transfer.target_dept / reject.reason_code 等';

CREATE TABLE IF NOT EXISTS care_task_feedback (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    task_id         BIGINT NOT NULL,
    feedback_type   VARCHAR(32) NOT NULL,             -- false_positive / rejected_reason / improvement_suggestion
    reason_code     VARCHAR(32),                       -- rule_not_applicable / student_special_case / handled_offline / already_transferred / other
    reason_detail   TEXT,                              -- 选填
    submitted_by    BIGINT NOT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_feedback_task ON care_task_feedback(task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_feedback_tenant_type ON care_task_feedback(tenant_id, feedback_type, submitted_at DESC);

COMMENT ON TABLE care_task_feedback IS '关怀任务反馈：误报 / 拒绝原因 / 改进建议，喂回 30 天规则效果报表';
COMMENT ON COLUMN care_task_feedback.feedback_type IS 'false_positive=误报；rejected_reason=拒绝原因；improvement_suggestion=辅导员主动建议';
