-- Expand P0 violation module with approval flow + student appeal.
-- V017 originally declared "no defense/sign/appeal/lift workflows"; this migration
-- re-introduces the minimum transitions the business requires:
--   counselor records -> submits for approval -> dean approves (or rejects)
--   student appeals an approved violation -> dean upholds (lifts punishment) or rejects.

-- 1. Add approval columns to violation_record
ALTER TABLE violation_record
    ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(16) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS approver_id       BIGINT,
    ADD COLUMN IF NOT EXISTS approver_name     TEXT,
    ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
    ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMPTZ;

-- Back-fill: existing rows predate this migration and are treated as already approved
-- so they keep triggering alert rule aggregations.
UPDATE violation_record
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_violation_approval_status
    ON violation_record(approval_status);

-- 2. Appeal table: one appeal per violation_record is typical; enforced at app layer
CREATE TABLE IF NOT EXISTS violation_appeal (
    id                    BIGINT PRIMARY KEY,
    tenant_id             VARCHAR(32) NOT NULL,
    violation_record_id   BIGINT NOT NULL,
    student_id            BIGINT NOT NULL,
    student_name          TEXT NOT NULL,
    reason                TEXT NOT NULL,
    status                VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending / upheld / rejected
    resolver_id           BIGINT,
    resolver_name         TEXT,
    resolution_note       TEXT,
    resolved_at           TIMESTAMPTZ,
    created_by            BIGINT,
    updated_by            BIGINT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appeal_tenant   ON violation_appeal(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appeal_record   ON violation_appeal(violation_record_id);
CREATE INDEX IF NOT EXISTS idx_appeal_student  ON violation_appeal(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeal_status   ON violation_appeal(status);

COMMENT ON TABLE violation_appeal IS '学生违纪申诉 (P0)';
