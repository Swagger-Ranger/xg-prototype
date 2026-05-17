-- 角色 / 团队拆分:同一张 sys_role 表承载两类语义,用 kind 字段区分。
--
--   kind='role'  系统岗位定义(辅导员、学工处 等)或用户自建的"角色"
--                (要给一组用户配一组权限码)。展示在「系统管理 → 角色权限」。
--
--   kind='team'  用户在「系统管理 → 团队管理」新建的业务编组
--                (评审委员会、迎新志愿者 等)。重点是"一群人 + 任务编组",
--                通常不配额外权限码。
--
-- 现存所有行回填 kind='role' — 保守、安全;用户决定是否把某些挪去 team。
ALTER TABLE sys_role
    ADD COLUMN IF NOT EXISTS kind         VARCHAR(16) NOT NULL DEFAULT 'role',
    ADD COLUMN IF NOT EXISTS team_type    VARCHAR(32),
    ADD COLUMN IF NOT EXISTS start_date   DATE,
    ADD COLUMN IF NOT EXISTS end_date     DATE,
    ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

-- 单字段 check 避免脏数据
ALTER TABLE sys_role
    DROP CONSTRAINT IF EXISTS sys_role_kind_check;
ALTER TABLE sys_role
    ADD CONSTRAINT sys_role_kind_check CHECK (kind IN ('role', 'team'));

ALTER TABLE sys_role
    DROP CONSTRAINT IF EXISTS sys_role_team_type_check;
ALTER TABLE sys_role
    ADD CONSTRAINT sys_role_team_type_check CHECK (
        team_type IS NULL
        OR team_type IN ('review', 'temporary', 'cross_dept', 'student_org', 'other')
    );

-- 仅 team 用 type / dates;role 行这几列必须为 NULL,防止误填
ALTER TABLE sys_role
    DROP CONSTRAINT IF EXISTS sys_role_team_fields_only_when_team;
ALTER TABLE sys_role
    ADD CONSTRAINT sys_role_team_fields_only_when_team CHECK (
        kind = 'team'
        OR (team_type IS NULL AND start_date IS NULL AND end_date IS NULL)
    );

-- 列表页需要按 kind 过滤,加索引
CREATE INDEX IF NOT EXISTS idx_sys_role_kind ON sys_role(kind);
