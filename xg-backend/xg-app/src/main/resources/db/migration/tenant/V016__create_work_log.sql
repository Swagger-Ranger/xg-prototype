-- Counselor work log (辅导员工作日志) — P0 MVP
-- Scope reduction: no separate work_log_template table; category enum is application-level
-- Skipped: linked_violation_id, linked_checkin_absence联动 (P0.5)
CREATE TABLE IF NOT EXISTS work_log (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    category            VARCHAR(32) NOT NULL,
    title               VARCHAR(200) NOT NULL,
    content             TEXT NOT NULL,
    data                JSONB DEFAULT '{}',
    author_id           BIGINT NOT NULL,
    author_name         TEXT,
    log_date            DATE NOT NULL,
    related_student_ids BIGINT[] DEFAULT '{}',
    created_by          BIGINT,
    updated_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_work_log_tenant       ON work_log(tenant_id);
CREATE INDEX idx_work_log_author       ON work_log(author_id, log_date DESC);
CREATE INDEX idx_work_log_category     ON work_log(category);
CREATE INDEX idx_work_log_log_date     ON work_log(log_date DESC);
CREATE INDEX idx_work_log_related      ON work_log USING GIN (related_student_ids);

COMMENT ON TABLE work_log IS '辅导员工作日志（P0 MVP，未含模板表）';
