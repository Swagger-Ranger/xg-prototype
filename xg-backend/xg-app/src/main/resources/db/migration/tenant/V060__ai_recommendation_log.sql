-- AI recommendation feedback log.
--
-- Captures (AI suggestion, human decision) tuples on every approval action,
-- so we can measure: how often does the AI agree with the human approver?
-- This is the first measurable input that lets us tune task_recommendation
-- prompts with data instead of intuition.
--
-- agreement_state semantics:
--   'agree'    — AI approve  + human approve, OR AI reject + human reject
--   'disagree' — AI approve  + human reject,  OR AI reject + human approve
--   'unclear'  — AI caution (no firm position), regardless of human decision
--   'no_ai'    — no AI recommendation was available (LLM error, timeout)
--
-- Read pattern (no FK on task_instance to avoid cascade pain on schema
-- iterations; analytics queries join on task_id when needed):
--   SELECT agreement_state, COUNT(*) FROM ai_recommendation_log
--    WHERE created_at > now() - interval '7 days' GROUP BY 1;

CREATE TABLE IF NOT EXISTS ai_recommendation_log (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,

    task_id         BIGINT       NOT NULL,
    biz_type        VARCHAR(64),
    biz_id          BIGINT,

    -- AI snapshot (nullable when AI was unavailable)
    ai_recommendation VARCHAR(20), -- approve | caution | reject
    ai_headline       VARCHAR(255),
    ai_rationale      TEXT,
    ai_model          VARCHAR(64),

    -- Human decision
    human_decision  VARCHAR(20)  NOT NULL, -- approve | reject
    human_comment   TEXT,
    approver_id     BIGINT       NOT NULL,

    -- Derived agreement
    agreement_state VARCHAR(20)  NOT NULL, -- agree | disagree | unclear | no_ai

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_rec_log_task        ON ai_recommendation_log(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_rec_log_created     ON ai_recommendation_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_rec_log_agreement   ON ai_recommendation_log(agreement_state, created_at);
