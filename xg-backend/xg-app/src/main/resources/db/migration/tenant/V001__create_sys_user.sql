-- System users within a tenant
CREATE TABLE IF NOT EXISTS sys_user (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    username        VARCHAR(64) NOT NULL,
    password_hash   TEXT,
    real_name       TEXT NOT NULL,
    gender          VARCHAR(8),           -- male, female, unknown
    phone           TEXT,
    email           TEXT,
    avatar_url      TEXT,
    external_id     TEXT,                 -- CAS/OAuth2 external user ID
    wechat_openid   TEXT,                 -- WeChat Mini Program openid
    wecom_userid    TEXT,                 -- WeChat Work userid
    status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active, disabled
    privacy_agreed  BOOLEAN DEFAULT FALSE,
    privacy_agreed_at TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(tenant_id, username)
);

CREATE INDEX idx_sys_user_tenant ON sys_user(tenant_id);
CREATE INDEX idx_sys_user_external ON sys_user(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_sys_user_openid ON sys_user(wechat_openid) WHERE wechat_openid IS NOT NULL;
CREATE INDEX idx_sys_user_wecom ON sys_user(wecom_userid) WHERE wecom_userid IS NOT NULL;
CREATE INDEX idx_sys_user_deleted ON sys_user(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE sys_user IS '系统用户表';
