-- Tighten built-in alert rules (design review 2026-04-19)
-- 1) Disable rule 3 (complaint_submitted): student-submitted complaints are
--    service-quality signal, not a student-risk signal — it was flagging the
--    wrong party. Keep the row for FK integrity on historical alerts.
-- 2) Rule 5 composite: add per_type_threshold=2 so a single stray event from
--    each module can no longer push someone to critical.
-- 3) All rules: add cooldown_days=7 so a resolved alert is not re-opened
--    the next scan while the originating events are still in window.

UPDATE alert_rule
   SET enabled = FALSE,
       description = '已停用：学生发起的投诉不是学生风险信号'
 WHERE id = 3;

UPDATE alert_rule
   SET config = jsonb_set(
           jsonb_set(config, '{per_type_threshold}', '2'::jsonb, TRUE),
           '{event_types}',
           '["leave_submit","violation_recorded","checkin_late"]'::jsonb,
           FALSE),
       description = '30 天内涉及 3+ 类风险事件（每类至少 2 次）'
 WHERE id = 5;

UPDATE alert_rule
   SET config = jsonb_set(config, '{cooldown_days}', '7'::jsonb, TRUE)
 WHERE id IN (1, 2, 4, 5);
