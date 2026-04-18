-- Student profile — extended attributes linked to sys_user
CREATE TABLE IF NOT EXISTS student_profile (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    user_id         BIGINT NOT NULL,                 -- sys_user.id
    student_no      VARCHAR(32) NOT NULL,            -- 学号
    grade           VARCHAR(16),                     -- 年级 (e.g., "2024级")
    college         TEXT,                            -- 学院
    major           TEXT,                            -- 专业
    class_name      TEXT,                            -- 班级
    class_id        BIGINT,                          -- org_unit.id for class
    enrollment_date DATE,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active, suspended, graduated, withdrawn
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(tenant_id, student_no),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_student_profile_tenant ON student_profile(tenant_id);
CREATE INDEX idx_student_profile_user ON student_profile(user_id);
CREATE INDEX idx_student_profile_class ON student_profile(class_id);
CREATE INDEX idx_student_profile_grade ON student_profile(grade);
CREATE INDEX idx_student_profile_status ON student_profile(status);

COMMENT ON TABLE student_profile IS '学生扩展信息表（学号、年级、专业等）';
