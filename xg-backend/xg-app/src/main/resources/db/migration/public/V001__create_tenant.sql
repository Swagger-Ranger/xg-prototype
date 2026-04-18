-- Tenant management (in public schema)
CREATE TABLE IF NOT EXISTS tenant (
    id              VARCHAR(32) PRIMARY KEY,
    name            TEXT NOT NULL,
    code            VARCHAR(64) NOT NULL UNIQUE,
    schema_name     VARCHAR(64) NOT NULL UNIQUE,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active, suspended, archived
    config          JSONB DEFAULT '{}',  -- SSO config, feature flags, etc.
    contact_name    TEXT,
    contact_phone   TEXT,
    contact_email   TEXT,
    max_users       INT DEFAULT 10000,
    expired_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tenant IS '租户表（公共Schema）';
COMMENT ON COLUMN tenant.config IS '租户配置（SSO、功能开关等）';
COMMENT ON COLUMN tenant.schema_name IS '租户对应的PostgreSQL Schema名称';
