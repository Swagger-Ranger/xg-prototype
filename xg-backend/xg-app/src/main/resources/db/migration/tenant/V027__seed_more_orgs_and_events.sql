-- Close the AI observer loop: give the dean a multi-college view and give at least
-- one counselor a non-empty class with varied event history.
-- Structure delta: +1 college, +2 classes, +1 counselor, +5 students, +18 events (10-day window).
-- ID ranges stay within the V021 convention (org 1000-1999, user 2000-2099, profile 3000-3999, mapping 4000-4999).

-- ── Orgs ────────────────────────────────────────────────────────────────────
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status) VALUES
    (1003, '${tenant_id}', NULL, '人文学院',      'humanities',  'college', 2, 'active'),
    (1004, '${tenant_id}', 1003, '汉语言 2301 班', 'hum-cl-2301', 'class',   1, 'active'),
    (1005, '${tenant_id}', 1001, '软件 2302 班',   'cs-sw-2302',  'class',   2, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_closure (ancestor_id, descendant_id, depth) VALUES
    (1003, 1003, 0),
    (1004, 1004, 0),
    (1005, 1005, 0),
    (1003, 1004, 1),
    (1001, 1005, 1)
ON CONFLICT DO NOTHING;

-- ── Second counselor, manages the new CS class primarily + humanities class secondary ──
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash)
VALUES (2002, '${tenant_id}', 'counselor_wang', '王老师', 'female', '13800000006', 'wang@demo.edu', 'active',
        '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES (2002, 2)
ON CONFLICT DO NOTHING;

INSERT INTO counselor_org_mapping (id, tenant_id, counselor_id, org_id, is_primary) VALUES
    (4002, '${tenant_id}', 2002, 1005, TRUE),
    (4003, '${tenant_id}', 2002, 1004, FALSE)
ON CONFLICT (counselor_id, org_id) DO NOTHING;

-- ── Five more students: 3 in the new CS class, 2 in humanities ──
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash) VALUES
    (2016, '${tenant_id}', 'stu_sun',   '孙志强', 'male',   '13900000016', 'sun@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2017, '${tenant_id}', 'stu_zhou',  '周佳怡', 'female', '13900000017', 'zhou@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2018, '${tenant_id}', 'stu_wu',    '吴海涛', 'male',   '13900000018', 'wu@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2019, '${tenant_id}', 'stu_zheng', '郑雅琴', 'female', '13900000019', 'zheng@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2020, '${tenant_id}', 'stu_feng',  '冯梓睿', 'male',   '13900000020', 'feng@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2016, 1), (2017, 1), (2018, 1), (2019, 1), (2020, 1)
ON CONFLICT DO NOTHING;

INSERT INTO student_profile (id, tenant_id, user_id, student_no, grade, college, major, class_name, class_id, enrollment_date, status) VALUES
    (3016, '${tenant_id}', 2016, '2023001006', '2023级', '计算机学院', '软件工程',   '软件 2302 班',   1005, '2023-09-01', 'active'),
    (3017, '${tenant_id}', 2017, '2023001007', '2023级', '计算机学院', '软件工程',   '软件 2302 班',   1005, '2023-09-01', 'active'),
    (3018, '${tenant_id}', 2018, '2023001008', '2023级', '计算机学院', '软件工程',   '软件 2302 班',   1005, '2023-09-01', 'active'),
    (3019, '${tenant_id}', 2019, '2023001009', '2023级', '人文学院',   '汉语言文学', '汉语言 2301 班', 1004, '2023-09-01', 'active'),
    (3020, '${tenant_id}', 2020, '2023001010', '2023级', '人文学院',   '汉语言文学', '汉语言 2301 班', 1004, '2023-09-01', 'active')
ON CONFLICT (tenant_id, student_no) DO NOTHING;

-- ── Diversified student_event_log: spread across last 10 days, mix severities and types ──
-- Types covered: checkin_late(4) / checkin_absent(6) / leave_submit(2) / leave_rejected(4)
--               / leave_cancelled(2) / violation_recorded(7) / complaint_submitted(3)
--               / notification_unconfirmed(3) / notification_confirmed(0)
INSERT INTO student_event_log (id, tenant_id, student_id, event_type, event_source, event_data, occurred_at, severity) VALUES
    -- 孙志强 (2016, 软件2302) 迟到高发 + 违纪 → 多模块风险样本
    (5001, '${tenant_id}', 2016, 'checkin_late',           'checkin',     '{"minutes_late": 12}'::jsonb, NOW() - INTERVAL '9 days',  4),
    (5002, '${tenant_id}', 2016, 'checkin_late',           'checkin',     '{"minutes_late": 25}'::jsonb, NOW() - INTERVAL '6 days',  4),
    (5003, '${tenant_id}', 2016, 'checkin_absent',         'checkin',     '{"activity": "晨跑"}'::jsonb, NOW() - INTERVAL '4 days',  6),
    (5004, '${tenant_id}', 2016, 'violation_recorded',     'violation',   '{"category": "宿舍违规", "points": 3}'::jsonb, NOW() - INTERVAL '2 days',  7),
    -- 周佳怡 (2017, 软件2302) 请假频繁 → 请假模式信号
    (5005, '${tenant_id}', 2017, 'leave_submit',           'leave',       '{"days": 1, "type": "personal"}'::jsonb, NOW() - INTERVAL '8 days',  2),
    (5006, '${tenant_id}', 2017, 'leave_submit',           'leave',       '{"days": 2, "type": "sick"}'::jsonb,     NOW() - INTERVAL '5 days',  2),
    (5007, '${tenant_id}', 2017, 'leave_submit',           'leave',       '{"days": 1, "type": "personal"}'::jsonb, NOW() - INTERVAL '1 days',  2),
    (5008, '${tenant_id}', 2017, 'leave_rejected',         'leave',       '{"reason": "材料不完整"}'::jsonb,        NOW() - INTERVAL '1 days',  4),
    -- 吴海涛 (2018, 软件2302) 低频正常样本
    (5009, '${tenant_id}', 2018, 'notification_confirmed', 'notification','{"notification_id": 9001}'::jsonb, NOW() - INTERVAL '7 days',  0),
    (5010, '${tenant_id}', 2018, 'checkin_late',           'checkin',     '{"minutes_late": 8}'::jsonb,      NOW() - INTERVAL '3 days',  4),
    -- 郑雅琴 (2019, 汉语言2301) 投诉 + 通知未确认
    (5011, '${tenant_id}', 2019, 'complaint_submitted',    'complaint',   '{"category": "宿舍", "anonymous": false}'::jsonb, NOW() - INTERVAL '7 days',  3),
    (5012, '${tenant_id}', 2019, 'notification_unconfirmed','scheduler',  '{"notification_id": 9002, "hours_since": 60}'::jsonb, NOW() - INTERVAL '5 days',  3),
    -- 冯梓睿 (2020, 汉语言2301) 正常请假流水
    (5013, '${tenant_id}', 2020, 'leave_submit',           'leave',       '{"days": 3, "type": "sick"}'::jsonb,   NOW() - INTERVAL '6 days',  2),
    (5014, '${tenant_id}', 2020, 'leave_cancelled',        'leave',       '{"source": "confirm"}'::jsonb,         NOW() - INTERVAL '6 days',  2),
    -- 补充既有学生的多样事件，让既有 counselor_li 的洞察也丰富些
    (5015, '${tenant_id}', 2011, 'notification_unconfirmed','scheduler',  '{"notification_id": 9003, "hours_since": 72}'::jsonb, NOW() - INTERVAL '4 days',  3),
    (5016, '${tenant_id}', 2012, 'leave_cancelled',        'leave',       '{"source": "force", "by": 2001}'::jsonb, NOW() - INTERVAL '5 days',  2),
    (5017, '${tenant_id}', 2013, 'checkin_absent',         'checkin',     '{"activity": "早自习"}'::jsonb,         NOW() - INTERVAL '3 days',  6),
    (5018, '${tenant_id}', 2014, 'violation_recorded',     'violation',   '{"category": "考勤违规", "points": 2}'::jsonb, NOW() - INTERVAL '2 days',  7)
ON CONFLICT (id) DO NOTHING;
