-- 知识库评估：测试用例 + KB 上的最近一次运行快照。
--
-- 评估的最小可用契约：每条 case 是 {query, expected_doc_ids[]}，离线跑一次
-- 检索器，按文档级 recall@K + MRR 打分。
-- last_eval_result 直接挂在 knowledge_base 上，避免 v1 阶段就引入 run 历史
-- 表；后续要看历史趋势再加。

CREATE TABLE IF NOT EXISTS kb_eval_case (
    id                BIGINT PRIMARY KEY,
    kb_id             BIGINT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    query             TEXT NOT NULL,
    expected_doc_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- BIGINT[] of kb_document.id
    note              TEXT,
    created_by        BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_eval_case_kb ON kb_eval_case(kb_id);

ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS last_eval_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_eval_result  JSONB;
