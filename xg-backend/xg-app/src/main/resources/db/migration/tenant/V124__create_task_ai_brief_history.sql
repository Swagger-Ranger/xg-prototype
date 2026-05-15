-- 主动关怀工作台 W2.1：AI brief 历史
-- PRD §11.4：append-only，不覆盖；care_task.current_brief_id 指向最新可用版本

CREATE TABLE IF NOT EXISTS task_ai_brief_history (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    task_id             BIGINT NOT NULL,

    brief               JSONB NOT NULL,                -- 完整 AI 输出（why/talking_points/avoid_topics/campus_resources/follow_up_days）
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generation_trigger  VARCHAR(32) NOT NULL,          -- batch_06 / batch_08 / batch_13 / lazy / manual_refresh
    prompt_version      VARCHAR(64) NOT NULL,          -- Prompt 版本，用于灰度新 prompt
    llm_model           VARCHAR(64) NOT NULL,          -- 模型代号，如 deepseek-chat / qwen-max
    sanitize_result     VARCHAR(16) NOT NULL           -- pass / blocked / redacted
);

CREATE INDEX IF NOT EXISTS idx_brief_task_latest ON task_ai_brief_history(task_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_brief_tenant_trigger ON task_ai_brief_history(tenant_id, generation_trigger, generated_at DESC);

COMMENT ON TABLE task_ai_brief_history IS 'AI brief 历史（append-only），任务关闭后归档不删除';
COMMENT ON COLUMN task_ai_brief_history.brief IS '完整 AI 输出 JSON：why/talking_points/avoid_topics/campus_resources/follow_up_days';
COMMENT ON COLUMN task_ai_brief_history.sanitize_result IS 'pass=通过；blocked=整体拦截（不展示）；redacted=部分脱敏后展示';
