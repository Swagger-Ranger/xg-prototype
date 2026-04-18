-- Work-study (勤工助学) — P0 MVP
-- Scope reduction: no timesheet/salary/approval workflow; position goes open on insert
CREATE TABLE IF NOT EXISTS work_study_position (
    id                     BIGINT PRIMARY KEY,
    tenant_id              VARCHAR(32) NOT NULL,
    title                  VARCHAR(200) NOT NULL,
    position_type          VARCHAR(16) NOT NULL DEFAULT 'fixed',   -- fixed / temporary
    department_name        VARCHAR(100) NOT NULL,
    description            TEXT NOT NULL,
    requirements           TEXT,
    prefer_financial_aid   BOOLEAN NOT NULL DEFAULT FALSE,
    hourly_rate            NUMERIC(6,2) NOT NULL,
    weekly_hours           INT NOT NULL DEFAULT 10,
    headcount              INT NOT NULL DEFAULT 1,
    hired_count            INT NOT NULL DEFAULT 0,
    status                 VARCHAR(16) NOT NULL DEFAULT 'open',     -- draft / pending_approval / open / closed
    start_date             DATE,
    end_date               DATE,
    creator_id             BIGINT NOT NULL,
    created_by             BIGINT,
    updated_by             BIGINT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE INDEX idx_ws_position_tenant  ON work_study_position(tenant_id);
CREATE INDEX idx_ws_position_status  ON work_study_position(status);
CREATE INDEX idx_ws_position_type    ON work_study_position(position_type);

COMMENT ON TABLE work_study_position IS '勤工助学岗位（P0 MVP，无审批工作流）';

CREATE TABLE IF NOT EXISTS work_study_application (
    id                       BIGINT PRIMARY KEY,
    tenant_id                VARCHAR(32) NOT NULL,
    position_id              BIGINT NOT NULL,
    student_id               BIGINT NOT NULL,
    student_name             TEXT NOT NULL,
    financial_aid_level      VARCHAR(16),
    intro                    TEXT NOT NULL,
    status                   VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / recommended / hired / rejected
    decision_note            TEXT,
    decided_by               BIGINT,
    decided_at               TIMESTAMPTZ,
    created_by               BIGINT,
    updated_by               BIGINT,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_ws_app_tenant   ON work_study_application(tenant_id);
CREATE INDEX idx_ws_app_position ON work_study_application(position_id);
CREATE INDEX idx_ws_app_student  ON work_study_application(student_id, created_at DESC);
CREATE INDEX idx_ws_app_status   ON work_study_application(status);

COMMENT ON TABLE work_study_application IS '勤工助学岗位申请（P0 MVP，无工作流）';
