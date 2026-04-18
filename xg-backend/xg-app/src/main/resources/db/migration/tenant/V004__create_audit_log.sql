CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    user_id         BIGINT,
    user_name       TEXT,
    action          VARCHAR(32) NOT NULL,       -- CREATE, UPDATE, DELETE, VIEW, EXPORT, LOGIN
    module          VARCHAR(32) NOT NULL,        -- leave, student, system, etc.
    target_type     VARCHAR(64),                 -- entity class name
    target_id       BIGINT,
    description     TEXT,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    request_method  VARCHAR(8),
    request_path    TEXT,
    before_data     JSONB,                       -- snapshot before change (for UPDATE/DELETE)
    after_data      JSONB,                       -- snapshot after change (for CREATE/UPDATE)
    sensitive_fields TEXT[],                      -- list of sensitive fields accessed (for VIEW)
    duration_ms     INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
    -- No deleted_at: audit logs are immutable
);

CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_module ON audit_log(module);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

COMMENT ON TABLE audit_log IS '审计日志（不可删除）';
