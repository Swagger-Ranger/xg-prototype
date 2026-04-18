-- Student complaint / "接诉即办"
CREATE TABLE IF NOT EXISTS complaint (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    title           TEXT NOT NULL,
    category        VARCHAR(32) NOT NULL,            -- life, study, facility, psychology, other
    content         TEXT NOT NULL,
    anonymous       BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending, processing, replied, closed
    student_id      BIGINT NOT NULL,                 -- sys_user.id of submitter
    student_name    TEXT NOT NULL,                   -- denormalized for display
    handler_id      BIGINT,                          -- counselor/officer who replies
    handler_name    TEXT,
    reply_content   TEXT,
    reply_at        TIMESTAMPTZ,
    satisfaction    SMALLINT,                        -- 1-5 star rating from submitter
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_complaint_tenant ON complaint(tenant_id);
CREATE INDEX idx_complaint_student ON complaint(student_id);
CREATE INDEX idx_complaint_status ON complaint(status);
CREATE INDEX idx_complaint_category ON complaint(category);
CREATE INDEX idx_complaint_created ON complaint(created_at DESC);

COMMENT ON TABLE complaint IS '学生接诉即办';
