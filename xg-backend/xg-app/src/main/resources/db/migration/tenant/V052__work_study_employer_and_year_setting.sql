-- Work-study P0a: employer entity, year-level settings, position field expansion.
-- Old columns on work_study_position (department_name / hourly_rate / weekly_hours)
-- are kept for backward compatibility — new code writes the new fields.

-- ==========================================================================
-- 1. employer (用人单位)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS employer (
    id                     BIGINT PRIMARY KEY,
    tenant_id              VARCHAR(32) NOT NULL,
    name                   VARCHAR(200) NOT NULL,
    leader_user_id         BIGINT NOT NULL,                      -- 单位负责人（→ workflow employer_leader 角色解析目标）
    operator_user_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- 操作员 [userId,...]
    contact_name           VARCHAR(100),
    contact_phone          VARCHAR(32),
    email                  VARCHAR(128),
    status                 VARCHAR(16) NOT NULL DEFAULT 'active',-- active / disabled
    allow_self_arrange     BOOLEAN NOT NULL DEFAULT FALSE,       -- 是否允许该单位内部安排（覆盖学年默认）
    remark                 TEXT,
    created_by             BIGINT,
    updated_by             BIGINT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employer_tenant ON employer(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employer_leader ON employer(leader_user_id);
CREATE INDEX IF NOT EXISTS idx_employer_status ON employer(status);

COMMENT ON TABLE employer IS '勤工助学用人单位';

-- ==========================================================================
-- 2. work_study_year_setting (学年级配置)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS work_study_year_setting (
    id                              BIGINT PRIMARY KEY,
    tenant_id                       VARCHAR(32) NOT NULL,
    academic_year                   VARCHAR(16) NOT NULL,                -- '2024-2025'
    max_fixed_per_student           INT NOT NULL DEFAULT 1,
    max_temp_per_student            INT NOT NULL DEFAULT 5,
    application_open                BOOLEAN NOT NULL DEFAULT FALSE,
    default_allow_self_arrange      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by                      BIGINT,
    updated_by                      BIGINT,
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at                      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_year_setting_year
    ON work_study_year_setting(tenant_id, academic_year)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE work_study_year_setting IS '勤工助学学年级配置（在岗上限/是否开放申请等）';

-- ==========================================================================
-- 3. work_study_position 字段扩展
-- ==========================================================================
ALTER TABLE work_study_position
    ADD COLUMN IF NOT EXISTS employer_id            BIGINT,
    ADD COLUMN IF NOT EXISTS academic_year          VARCHAR(16),
    ADD COLUMN IF NOT EXISTS owner_user_id          BIGINT,                 -- 岗位负责人（→ workflow dynamic assignee 解析目标）
    ADD COLUMN IF NOT EXISTS owner_phone            VARCHAR(32),
    ADD COLUMN IF NOT EXISTS campus                 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS work_location          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS duration_months        INT,
    ADD COLUMN IF NOT EXISTS time_slots             JSONB,                  -- [{"day":"mon","start":"14:00","end":"17:00"}]
    ADD COLUMN IF NOT EXISTS application_deadline   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS salary_unit            VARCHAR(16),            -- hour / day / month / per_task
    ADD COLUMN IF NOT EXISTS salary_amount          NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS reason                 TEXT,                   -- 设岗理由
    ADD COLUMN IF NOT EXISTS gender_limit           VARCHAR(8),             -- male / female / NULL=不限
    ADD COLUMN IF NOT EXISTS aid_levels             JSONB,                  -- ["special","difficult","mild","none"]
    ADD COLUMN IF NOT EXISTS grade_limits           JSONB,                  -- ["2023","2024"]
    ADD COLUMN IF NOT EXISTS college_limits         JSONB,                  -- [collegeId,...]
    ADD COLUMN IF NOT EXISTS self_arranged          BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ws_position_employer ON work_study_position(employer_id);
CREATE INDEX IF NOT EXISTS idx_ws_position_year     ON work_study_position(academic_year);
CREATE INDEX IF NOT EXISTS idx_ws_position_owner    ON work_study_position(owner_user_id);

COMMENT ON COLUMN work_study_position.employer_id   IS '关联 employer.id（替代旧 department_name 字符串）';
COMMENT ON COLUMN work_study_position.owner_user_id IS '岗位负责人 ID，工作流 dynamic assignee 解析对象';
COMMENT ON COLUMN work_study_position.self_arranged IS '该岗位是否单位内部安排（不走学生申请流程）';
