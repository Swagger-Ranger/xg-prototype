-- Agent-generated workspace insights for counselor & dean roles.
-- Generated daily by InsightScanScheduler or on-demand via /insights/refresh.
CREATE TABLE IF NOT EXISTS workspace_insight (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    role            VARCHAR(16) NOT NULL,          -- counselor / dean
    scope_key       VARCHAR(64) NOT NULL,          -- counselor: user_id string; dean: 'global'
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expired_at      TIMESTAMPTZ,                    -- null = not expired; typically generated_at + 36h
    model           VARCHAR(64),                    -- e.g. 'deepseek-chat'
    metrics         JSONB NOT NULL,                 -- raw aggregates sent to LLM (for traceability)
    insights        JSONB NOT NULL,                 -- [{severity, category, title, detail, suggestion, refs}]
    status          VARCHAR(16) NOT NULL DEFAULT 'ready',  -- pending / ready / failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insight_role_scope ON workspace_insight(role, scope_key, generated_at DESC);
CREATE INDEX idx_insight_tenant ON workspace_insight(tenant_id);

COMMENT ON TABLE workspace_insight IS 'AI Agent 生成的工作台洞察（辅导员/院领导）';
COMMENT ON COLUMN workspace_insight.scope_key IS '辅导员: user_id 字符串；院领导: global';
COMMENT ON COLUMN workspace_insight.metrics IS '生成洞察时使用的聚合指标快照';
COMMENT ON COLUMN workspace_insight.insights IS 'LLM 输出的结构化洞察数组';
