-- 5 built-in alert rules (design §3.11)
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

INSERT INTO alert_rule (id, tenant_id, name, description, rule_type, config, severity, enabled)
VALUES
    (1, '${tenant_id}', '请假频繁',       '30 天内请假 ≥ 5 次',
        'frequency', '{"event_type":"leave_submit","window_days":30,"threshold":5}'::jsonb,
        'medium',   TRUE),
    (2, '${tenant_id}', '近期违纪',       '7 天内违纪 ≥ 2 次',
        'frequency', '{"event_type":"violation_recorded","window_days":7,"threshold":2}'::jsonb,
        'high',     TRUE),
    (3, '${tenant_id}', '投诉偏高',       '14 天内投诉 ≥ 2 次',
        'frequency', '{"event_type":"complaint_submitted","window_days":14,"threshold":2}'::jsonb,
        'medium',   TRUE),
    (4, '${tenant_id}', '迟到模式',       '14 天内迟到 ≥ 3 次',
        'frequency', '{"event_type":"checkin_late","window_days":14,"threshold":3}'::jsonb,
        'medium',   TRUE),
    (5, '${tenant_id}', '多模块异常',     '30 天内涉及 3+ 种风险事件（跨模块）',
        'composite', '{"event_types":["leave_submit","violation_recorded","complaint_submitted","checkin_late"],"window_days":30,"distinct_threshold":3}'::jsonb,
        'critical', TRUE)
ON CONFLICT (id) DO NOTHING;
