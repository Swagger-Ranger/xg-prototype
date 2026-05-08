-- 学生勤工助学偏好（一人一行）
-- · course_schedule  7 天 × 5 段（钟点制，与学校无关）的"有课"格子
--   形如 { "mon": ["p1","p2"], "tue": [], ... }
--   pX 含义在前后端共享常量里：
--     p1=8:00-10:00  p2=10:00-12:00  p3=14:00-16:00  p4=16:00-18:00  p5=19:00-21:00
-- · position_pref    岗位偏好  {types?:["fixed","temporary"], campus?, rate_min?, rate_max?, keywords?}
--
-- 学生通过 PUT /work-study/me/preference 写入，AI 后续在 findByPreference /
-- matchToSchedule 上传参数为空时会回查这张表（P1 处理）。

CREATE TABLE IF NOT EXISTS student_workstudy_preference (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    student_id          BIGINT NOT NULL,                       -- → user.id（学生）
    course_schedule     JSONB NOT NULL DEFAULT '{}'::jsonb,
    position_pref       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by          BIGINT,
    updated_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- 单租户单学生唯一（schema 级隔离 + 兜底约束）。
CREATE UNIQUE INDEX IF NOT EXISTS uk_student_workstudy_pref_student
    ON student_workstudy_preference(tenant_id, student_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_workstudy_pref_tenant
    ON student_workstudy_preference(tenant_id);

COMMENT ON TABLE student_workstudy_preference IS '学生勤工助学偏好：课表（推空闲）+ 岗位偏好';
