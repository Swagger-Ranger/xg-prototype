-- Student violation (学生违纪) — P0 MVP
-- Scope reduction: single-level punishment, no defense/sign/appeal/lift workflows
-- category is a free enum string (exam_cheat / dorm_violation / absence / fighting / other)
CREATE TABLE IF NOT EXISTS violation_record (
    id                BIGINT PRIMARY KEY,
    tenant_id         VARCHAR(32) NOT NULL,
    student_id        BIGINT NOT NULL,
    student_name      TEXT NOT NULL,
    category          VARCHAR(32) NOT NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    location          VARCHAR(200),
    description       TEXT NOT NULL,
    recorder_id       BIGINT NOT NULL,
    recorder_name     TEXT,
    punishment_id     BIGINT,
    created_by        BIGINT,
    updated_by        BIGINT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_violation_tenant   ON violation_record(tenant_id);
CREATE INDEX idx_violation_student  ON violation_record(student_id, occurred_at DESC);
CREATE INDEX idx_violation_category ON violation_record(category);
CREATE INDEX idx_violation_occur    ON violation_record(occurred_at DESC);

COMMENT ON TABLE violation_record IS '学生违纪记录（P0 MVP）';

CREATE TABLE IF NOT EXISTS punishment (
    id                    BIGINT PRIMARY KEY,
    tenant_id             VARCHAR(32) NOT NULL,
    violation_record_id   BIGINT,
    student_id            BIGINT NOT NULL,
    student_name          TEXT NOT NULL,
    level                 VARCHAR(32) NOT NULL,   -- warning / serious_warning / demerit / probation / expulsion
    reason                TEXT NOT NULL,
    effective_date        DATE NOT NULL,
    expiry_date           DATE,
    status                VARCHAR(16) NOT NULL DEFAULT 'effective',  -- pending / effective / lifted / rejected
    issuer_id             BIGINT NOT NULL,
    issuer_name           TEXT,
    created_by            BIGINT,
    updated_by            BIGINT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_punishment_tenant  ON punishment(tenant_id);
CREATE INDEX idx_punishment_student ON punishment(student_id, effective_date DESC);
CREATE INDEX idx_punishment_level   ON punishment(level);
CREATE INDEX idx_punishment_status  ON punishment(status);

COMMENT ON TABLE punishment IS '处分记录（P0 MVP，无申辩/签收/申诉/解除工作流）';
