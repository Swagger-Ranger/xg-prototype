-- Platform-level audit log (public schema, not tied to any tenant).
-- Records every write operation performed by a platform admin: tenant CRUD,
-- admin CRUD, login attempts, etc. Immutable: no updated_at, no deleted_at.
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id              BIGINT PRIMARY KEY,
    admin_id        BIGINT,                          -- nullable for failed-login rows where the admin couldn't be resolved
    admin_username  VARCHAR(64),                     -- denormalized so deleted admins remain traceable
    action          VARCHAR(64) NOT NULL,            -- e.g. tenant.create, tenant.suspend, admin.create, login.success
    target_type     VARCHAR(32),                     -- tenant / platform_admin / null (e.g. for login)
    target_id       VARCHAR(64),                     -- tenant.id (string) or platform_admin.id (numeric stored as text)
    description     TEXT,
    before_data     JSONB,                           -- snapshot before the change
    after_data      JSONB,                           -- snapshot after the change
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_audit_admin   ON platform_audit_log (admin_id, created_at DESC);
CREATE INDEX idx_platform_audit_action  ON platform_audit_log (action, created_at DESC);
CREATE INDEX idx_platform_audit_target  ON platform_audit_log (target_type, target_id);
CREATE INDEX idx_platform_audit_created ON platform_audit_log (created_at DESC);

COMMENT ON TABLE platform_audit_log IS '平台超管审计日志（公共Schema，不可变）';
