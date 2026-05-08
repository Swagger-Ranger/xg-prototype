CREATE TABLE IF NOT EXISTS student_event_log (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    student_id      BIGINT NOT NULL,
    event_type      VARCHAR(32) NOT NULL,         -- leave_submit, checkin_absent, violation_recorded, complaint_submit, etc.
    event_source    VARCHAR(32) NOT NULL,          -- module name: leave, checkin, violation, complaint
    event_data      JSONB,                         -- event-specific payload
    occurred_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
    -- No update/delete: event log is append-only
);

CREATE INDEX idx_event_tenant_student ON student_event_log(tenant_id, student_id);
CREATE INDEX idx_event_type ON student_event_log(event_type);
CREATE INDEX idx_event_occurred ON student_event_log(occurred_at DESC);
CREATE INDEX idx_event_student_recent ON student_event_log(student_id, occurred_at DESC);

COMMENT ON TABLE student_event_log IS '学生事件流水（跨模块事件记录，用于异常预警）';
