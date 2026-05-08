-- RAG 管理（仿 Dify）—— 三张表全部落 public 因为知识库是跨租户的全局资源。
--
-- 设计要点：
-- - 单表共享 embedding 维度（512 = bge-m3 / qwen-text-embed-v3 默认）。
--   未来多嵌入模型如果维度不同，再加分表或 dim 子选项；先保持简单。
-- - kb_chunk.embedding 用 pgvector hnsw 余弦索引，content 用 GIN(ts_vector)
--   做 BM25 召回，hybrid retriever 用 RRF 融合两路。
-- - kb_document 上的 indexing_status 用于异步 ingest（先做同步、表里留好字段
--   方便后续切到队列）。
-- - 删除走软删 (deleted_at)；chunk 是 ON DELETE CASCADE 跟随文档物理删除。

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,

    -- 嵌入与重排（标签 + 维度，dim 用于 chunk 表的 vector 大小校验）
    embedding_model VARCHAR(64) NOT NULL,
    embedding_dim   INT NOT NULL DEFAULT 512,
    rerank_model    VARCHAR(64),

    -- 切分参数
    chunk_size      INT NOT NULL DEFAULT 500,
    chunk_overlap   INT NOT NULL DEFAULT 50,

    -- 检索参数
    retrieval_mode  VARCHAR(16) NOT NULL DEFAULT 'hybrid',  -- vector | keyword | hybrid
    top_k           INT NOT NULL DEFAULT 5,
    score_threshold REAL,

    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kb_name ON knowledge_base(name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS kb_document (
    id              BIGINT PRIMARY KEY,
    kb_id           BIGINT NOT NULL REFERENCES knowledge_base(id),
    name            TEXT NOT NULL,
    source_type     VARCHAR(16) NOT NULL,  -- file | url | manual
    source_meta     JSONB,                 -- {original_filename, mime_type, legacy_doc_id, ...}
    file_size_bytes BIGINT,
    file_hash       TEXT,
    char_count      INT,
    chunk_count     INT,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,

    -- ingest 状态
    indexing_status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending | processing | done | error
    indexing_error  TEXT,
    indexed_at      TIMESTAMPTZ,

    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kb_doc_kb       ON kb_document(kb_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kb_doc_status   ON kb_document(indexing_status);

CREATE TABLE IF NOT EXISTS kb_chunk (
    id           BIGINT PRIMARY KEY,
    document_id  BIGINT NOT NULL REFERENCES kb_document(id) ON DELETE CASCADE,
    kb_id        BIGINT NOT NULL,
    chunk_index  INT NOT NULL,
    content      TEXT NOT NULL,
    metadata     JSONB,                    -- {heading, section, page, ...}
    embedding    vector(512),             -- nullable until embedded
    char_count   INT,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1) HNSW 余弦近似检索
CREATE INDEX IF NOT EXISTS idx_kb_chunk_embedding
    ON kb_chunk USING hnsw (embedding vector_cosine_ops);

-- 2) 全文（中文用 simple，靠 jieba/外部分词器在应用层；这里 GIN simple 至少做 token 召回）
CREATE INDEX IF NOT EXISTS idx_kb_chunk_content_fts
    ON kb_chunk USING gin (to_tsvector('simple', content));

CREATE INDEX IF NOT EXISTS idx_kb_chunk_doc ON kb_chunk(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_kb  ON kb_chunk(kb_id);

-- 默认知识库（迁移老硬编码文档去这里）
INSERT INTO knowledge_base (id, name, description, embedding_model, embedding_dim, rerank_model,
                            chunk_size, chunk_overlap, retrieval_mode, top_k, score_threshold)
VALUES (1, '默认知识库（校规制度）', '系统初始内置的请假/违纪/奖学金等校规制度文档',
        'qwen-text-embedding-v3', 512, NULL,
        500, 50, 'hybrid', 5, NULL)
ON CONFLICT (id) DO NOTHING;
