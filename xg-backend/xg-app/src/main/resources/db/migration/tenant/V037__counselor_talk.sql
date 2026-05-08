-- Phase 5 — counselor_talk module + alert integration.
-- Persists the actual conversation a counselor has with a student; typically triggered
-- by an active student_alert, in which case source_alert_id links back and the alert
-- is auto-acknowledged when the talk is saved.

CREATE TABLE IF NOT EXISTS counselor_talk (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    student_id      BIGINT NOT NULL,
    student_name    TEXT NOT NULL,
    counselor_id    BIGINT NOT NULL,
    counselor_name  TEXT NOT NULL,
    topic           VARCHAR(32) NOT NULL,          -- academic / mental / discipline / career / other
    content         TEXT NOT NULL,
    follow_up       TEXT,
    talk_at         TIMESTAMPTZ NOT NULL,
    source_alert_id BIGINT,                        -- optional cross-link to student_alert
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_counselor_talk_tenant   ON counselor_talk(tenant_id);
CREATE INDEX IF NOT EXISTS idx_counselor_talk_student  ON counselor_talk(student_id, talk_at DESC);
CREATE INDEX IF NOT EXISTS idx_counselor_talk_source   ON counselor_talk(source_alert_id) WHERE source_alert_id IS NOT NULL;

COMMENT ON TABLE counselor_talk IS '辅导员与学生谈话记录 (P0)';
