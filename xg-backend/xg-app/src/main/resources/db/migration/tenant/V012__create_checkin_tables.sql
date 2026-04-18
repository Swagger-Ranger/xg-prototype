-- Check-in activity
CREATE TABLE IF NOT EXISTS checkin_activity (
    id                      BIGINT PRIMARY KEY,
    tenant_id               VARCHAR(32) NOT NULL,
    title                   VARCHAR(200) NOT NULL,
    creator_id              BIGINT NOT NULL,
    scope_org_ids           BIGINT[],
    expected_count          INT NOT NULL DEFAULT 0,
    checkin_mode            VARCHAR(16) NOT NULL DEFAULT 'qr_scan',  -- qr_scan / roll_call
    qr_code_secret          VARCHAR(64),
    qr_refresh_interval     INT NOT NULL DEFAULT 30,
    late_threshold_minutes  INT NOT NULL DEFAULT 5,
    start_time              TIMESTAMPTZ NOT NULL,
    end_time                TIMESTAMPTZ NOT NULL,
    enable_checkout         BOOLEAN NOT NULL DEFAULT FALSE,
    checkout_end_time       TIMESTAMPTZ,
    status                  VARCHAR(16) NOT NULL DEFAULT 'active',  -- active / closed
    geo_fence               JSONB,
    created_by              BIGINT,
    updated_by              BIGINT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_checkin_activity_tenant ON checkin_activity(tenant_id);
CREATE INDEX idx_checkin_activity_creator ON checkin_activity(creator_id);
CREATE INDEX idx_checkin_activity_status ON checkin_activity(status);
CREATE INDEX idx_checkin_activity_time ON checkin_activity(start_time, end_time);

-- Check-in record
CREATE TABLE IF NOT EXISTS checkin_record (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    activity_id     BIGINT NOT NULL REFERENCES checkin_activity(id),
    student_id      BIGINT NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'on_time',  -- on_time / late / absent
    checked_in_at   TIMESTAMPTZ,
    checked_out_at  TIMESTAMPTZ,
    source          VARCHAR(16) NOT NULL DEFAULT 'qr_scan',  -- qr_scan / roll_call / manual
    location        JSONB,
    operator_id     BIGINT,
    note            VARCHAR(200),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checkin_record_activity ON checkin_record(activity_id);
CREATE INDEX idx_checkin_record_student ON checkin_record(student_id);
CREATE UNIQUE INDEX idx_checkin_record_unique ON checkin_record(activity_id, student_id);

COMMENT ON TABLE checkin_activity IS '签到活动';
COMMENT ON TABLE checkin_record IS '签到记录';
