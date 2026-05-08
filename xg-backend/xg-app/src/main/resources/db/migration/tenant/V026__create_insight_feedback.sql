-- HITL feedback on individual insight items.
-- One row per (insight, item index, user); re-voting updates the action.
CREATE TABLE IF NOT EXISTS insight_feedback (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    VARCHAR(32) NOT NULL,
    insight_id   BIGINT NOT NULL REFERENCES workspace_insight(id) ON DELETE CASCADE,
    item_index   SMALLINT NOT NULL,          -- 0-based index into workspace_insight.insights JSON array
    user_id      BIGINT NOT NULL,
    action       VARCHAR(8) NOT NULL,        -- 'up' / 'down'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (insight_id, item_index, user_id)
);

CREATE INDEX idx_feedback_insight ON insight_feedback(insight_id, item_index);

COMMENT ON TABLE insight_feedback IS '用户对单条 AI 洞察的 HITL 反馈（赞/踩）';
COMMENT ON COLUMN insight_feedback.item_index IS 'workspace_insight.insights JSON 数组的 0-based 下标';
COMMENT ON COLUMN insight_feedback.action IS 'up=有用 / down=无用';
