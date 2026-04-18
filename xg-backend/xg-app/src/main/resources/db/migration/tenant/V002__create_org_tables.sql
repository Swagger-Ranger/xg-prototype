-- Organization unit (school/college/major/class tree)
CREATE TABLE IF NOT EXISTS org_unit (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    parent_id       BIGINT,
    name            TEXT NOT NULL,
    code            VARCHAR(64),
    type            VARCHAR(16) NOT NULL,  -- school, college, major, class
    sort_order      INT DEFAULT 0,
    leader_id       BIGINT,               -- org leader (dean for college, etc.)
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    extra           JSONB DEFAULT '{}',
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    FOREIGN KEY (parent_id) REFERENCES org_unit(id)
);

CREATE INDEX idx_org_unit_tenant ON org_unit(tenant_id);
CREATE INDEX idx_org_unit_parent ON org_unit(parent_id);
CREATE INDEX idx_org_unit_type ON org_unit(type);

-- Closure table for efficient ancestor/descendant queries
CREATE TABLE IF NOT EXISTS org_closure (
    ancestor_id     BIGINT NOT NULL REFERENCES org_unit(id),
    descendant_id   BIGINT NOT NULL REFERENCES org_unit(id),
    depth           INT NOT NULL DEFAULT 0,

    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_org_closure_desc ON org_closure(descendant_id);

COMMENT ON TABLE org_unit IS '组织架构表（学校/学院/专业/班级）';
COMMENT ON TABLE org_closure IS '组织架构闭包表（用于祖先/后代快速查询）';
