-- Platform admin accounts (super_admin, not tied to any tenant)
CREATE TABLE IF NOT EXISTS platform_admin (
    id              BIGINT PRIMARY KEY,
    username        VARCHAR(64) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    real_name       TEXT,
    phone           TEXT,
    email           TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE platform_admin IS '平台管理员（超级管理员）';
