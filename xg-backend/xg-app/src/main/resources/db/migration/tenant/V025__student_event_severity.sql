ALTER TABLE student_event_log
    ADD COLUMN IF NOT EXISTS severity SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_event_severity_occurred
    ON student_event_log(severity DESC, occurred_at DESC)
    WHERE severity >= 5;

COMMENT ON COLUMN student_event_log.severity IS '严重度 0-10：0=无影响，<=2 常规，3-5 关注，6-8 预警，>=9 紧急';
