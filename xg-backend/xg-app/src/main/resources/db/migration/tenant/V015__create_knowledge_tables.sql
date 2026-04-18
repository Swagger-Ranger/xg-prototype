-- Knowledge Q&A log (P0 stub — AI sidecar handles actual RAG)
CREATE TABLE IF NOT EXISTS knowledge_qa (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    user_id         BIGINT NOT NULL,                 -- sys_user.id of asker
    question        TEXT NOT NULL,
    answer          TEXT,
    sources         JSONB DEFAULT '[]',              -- [{doc_id, title, url}]
    category        VARCHAR(32),                     -- general, leave_policy, scholarship, etc.
    helpful         BOOLEAN,                         -- user feedback; null = no feedback yet
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_knowledge_qa_tenant ON knowledge_qa(tenant_id);
CREATE INDEX idx_knowledge_qa_user ON knowledge_qa(user_id);
CREATE INDEX idx_knowledge_qa_category ON knowledge_qa(category);
CREATE INDEX idx_knowledge_qa_created ON knowledge_qa(created_at DESC);

COMMENT ON TABLE knowledge_qa IS '知识问答记录（P0 占位，AI sidecar 提供实际 RAG）';
