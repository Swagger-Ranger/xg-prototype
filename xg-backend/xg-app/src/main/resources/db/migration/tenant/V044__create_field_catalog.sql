-- Field catalog: per-tenant registry of all known form fields, used to
-- recommend reuse when an admin/counselor adds a new field via natural
-- language. The full schema includes columns for the eventual ProfileSync
-- (target_*) and auto-index (index_strategy) features even though this
-- migration only powers the reuse-recommendation path; later phases will
-- light those up without further DDL.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS field_catalog (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    name            VARCHAR(64) NOT NULL,
    label           VARCHAR(100) NOT NULL,
    type            VARCHAR(16) NOT NULL,                  -- string / number / boolean / date / file
    description     TEXT,                                  -- one-line semantic description (admin authored)

    -- Recommendation / ranking signals
    canonical       BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE = school-blessed standard field
    usage_count     INT NOT NULL DEFAULT 0,                -- how many flows reference this field
    category        VARCHAR(32),                           -- contact / address / academic / health / financial / temporary
    aliases         JSONB NOT NULL DEFAULT '[]'::jsonb,    -- known synonym list

    -- Field metadata copied to the workflow form.fields[] entry on reuse
    required        BOOLEAN NOT NULL DEFAULT FALSE,
    placeholder     TEXT,
    pattern         TEXT,
    options         JSONB,
    min_value       NUMERIC,
    max_value       NUMERIC,
    min_length      INT,
    max_length      INT,

    -- Profile sync routing (Phase B — populated by admin, consumed later by ProfileSyncService)
    target_table    VARCHAR(64),
    target_path     VARCHAR(128),
    write_strategy  VARCHAR(16) NOT NULL DEFAULT 'none',   -- none / overwrite / append_history / request
    sensitivity     VARCHAR(16) NOT NULL DEFAULT 'normal', -- normal / sensitive / private

    -- Auto-index (Phase C)
    index_strategy  VARCHAR(16) NOT NULL DEFAULT 'none',   -- none / gin / column

    -- Lineage
    used_in_flows   JSONB NOT NULL DEFAULT '[]'::jsonb,
    deprecated      BOOLEAN NOT NULL DEFAULT FALSE,

    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE (tenant_id, name)
);

-- Trigram indexes power similarity() lookups on Chinese labels and descriptions.
-- Combined with btree on tenant_id, the planner picks an index intersection
-- that scales to several thousand fields without sequential scan.
CREATE INDEX IF NOT EXISTS idx_field_catalog_label_trgm
    ON field_catalog USING gin (label gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_field_catalog_desc_trgm
    ON field_catalog USING gin (description gin_trgm_ops)
    WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_catalog_tenant
    ON field_catalog (tenant_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_field_catalog_canonical
    ON field_catalog (tenant_id, canonical, usage_count DESC)
    WHERE deleted_at IS NULL AND deprecated = FALSE;

COMMENT ON TABLE field_catalog IS '字段字典：跨流程的字段元数据登记，用于复用推荐与未来的 profile sync';
COMMENT ON COLUMN field_catalog.canonical IS '是否为学校认证的标准字段（推荐时排序优先）';
COMMENT ON COLUMN field_catalog.usage_count IS '被工作流定义引用的次数，复用推荐时与 canonical 一起作为排序权重';
COMMENT ON COLUMN field_catalog.write_strategy IS '提交后写入档案的策略：none/overwrite/append_history/request；本期未启用';
