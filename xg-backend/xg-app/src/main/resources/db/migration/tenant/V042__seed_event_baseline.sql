-- Back-fill student_event_log so every student (regardless of status) has at
-- least a few timeline entries. Students already covered by V041 (IDs 5500-5596)
-- are skipped via the NOT EXISTS clause. Deterministic IDs
-- (10000 + user_id*10 + seq) keep the migration idempotent via ON CONFLICT.

INSERT INTO student_event_log (id, tenant_id, student_id, event_type, event_source, event_data, occurred_at, severity)
SELECT
    10000 + s.user_id * 10 + ev.seq                AS id,
    '${tenant_id}'                                  AS tenant_id,
    s.user_id                                       AS student_id,
    ev.event_type,
    ev.event_source,
    ev.event_data,
    NOW() - (ev.days_ago || ' days')::interval      AS occurred_at,
    ev.severity
FROM (
    SELECT sp.user_id
    FROM student_profile sp
    WHERE sp.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM student_event_log sel WHERE sel.student_id = sp.user_id
      )
) s
CROSS JOIN (VALUES
    (1, 'notification_confirmed', 'notification', '{"notification_title":"学期开学通知"}'::jsonb,        40, 0),
    (2, 'leave_submit',           'leave',        '{"leave_type":"personal","days":1}'::jsonb,           25, 2),
    (3, 'checkin_late',           'checkin',      '{"course":"思政课","late_minutes":5}'::jsonb,         12, 4),
    (4, 'collection_filled',      'collection',   '{"collection_title":"返校信息登记"}'::jsonb,          5,  0)
) AS ev(seq, event_type, event_source, event_data, days_ago, severity)
ON CONFLICT (id) DO NOTHING;
