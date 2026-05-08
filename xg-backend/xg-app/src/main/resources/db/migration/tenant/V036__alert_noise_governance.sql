-- Phase 4 — alert noise governance.
-- Adds fields the alert engine needs to suppress repeat firings while still
-- surfacing fresh evidence:
--   counselor_talk_id: Phase 5 打通 link (nullable, set by counselor_talk service)
--   muted_until      : manual mute — engine skips insert/re-fire while NOW() < muted_until

ALTER TABLE student_alert
    ADD COLUMN IF NOT EXISTS counselor_talk_id BIGINT,
    ADD COLUMN IF NOT EXISTS muted_until       TIMESTAMPTZ;

-- Drop the narrow index that only covers status='open' — with re-fires bringing
-- acknowledged rows back to open, and false_positive as a new terminal state,
-- queries now filter on status IN (...) and benefit from a plain index.
DROP INDEX IF EXISTS idx_alert_status;
CREATE INDEX IF NOT EXISTS idx_alert_status_v2 ON student_alert(status);
