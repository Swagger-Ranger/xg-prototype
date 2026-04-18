-- Roles
CREATE TABLE IF NOT EXISTS sys_role (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    code            VARCHAR(32) NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    is_builtin      BOOLEAN DEFAULT FALSE,
    sort_order      INT DEFAULT 0,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(tenant_id, code)
);

-- Permissions
CREATE TABLE IF NOT EXISTS sys_permission (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    code            VARCHAR(64) NOT NULL,
    name            TEXT NOT NULL,
    module          VARCHAR(32),          -- leave, collection, checkin, etc.
    type            VARCHAR(16) NOT NULL DEFAULT 'menu',  -- menu, button, data
    parent_code     VARCHAR(64),
    sort_order      INT DEFAULT 0,
    is_builtin      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS sys_role_permission (
    role_id         BIGINT NOT NULL REFERENCES sys_role(id),
    permission_id   BIGINT NOT NULL REFERENCES sys_permission(id),

    PRIMARY KEY (role_id, permission_id)
);

-- User-Role mapping
CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id         BIGINT NOT NULL REFERENCES sys_user(id),
    role_id         BIGINT NOT NULL REFERENCES sys_role(id),
    org_id          BIGINT REFERENCES org_unit(id),  -- role scope (e.g., counselor for which college)

    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_role_role ON sys_user_role(role_id);

-- Counselor-Organization mapping (many-to-many: one counselor can manage multiple classes)
CREATE TABLE IF NOT EXISTS counselor_org_mapping (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    counselor_id    BIGINT NOT NULL REFERENCES sys_user(id),
    org_id          BIGINT NOT NULL REFERENCES org_unit(id),
    is_primary      BOOLEAN DEFAULT FALSE,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(counselor_id, org_id)
);

CREATE INDEX idx_counselor_org_counselor ON counselor_org_mapping(counselor_id);
CREATE INDEX idx_counselor_org_org ON counselor_org_mapping(org_id);

COMMENT ON TABLE sys_role IS '角色表';
COMMENT ON TABLE sys_permission IS '权限表';
COMMENT ON TABLE sys_role_permission IS '角色-权限关联表';
COMMENT ON TABLE sys_user_role IS '用户-角色关联表';
COMMENT ON TABLE counselor_org_mapping IS '辅导员-组织管辖关系表（多对多）';
