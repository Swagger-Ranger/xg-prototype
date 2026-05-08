-- Demo seed for the 朝夕 校园 dashboard. Provides:
--   · One current academic term (2025-2026 第二学期, ~Feb-July 2026)
--   · Class schedules for the 3 demo classes seeded earlier (V021, V027)
--   · Academic events: 期末考试 (granularity=month) / 暑假 / 端午 / 五一
-- Numbers chosen so a developer pulling the seed today (2026-05-x) sees a
-- live "第 11 周 / 距期末考 ~6 周" experience without having to also seed.

-- ── Academic term ───────────────────────────────────────────────────
INSERT INTO academic_term (id, tenant_id, code, name, start_date, end_date, total_weeks, is_current)
VALUES
    (3001, '${tenant_id}', '2025-2026-2', '2025-2026 学年第二学期',
     DATE '2026-02-23', DATE '2026-07-12', 20, TRUE),
    (3000, '${tenant_id}', '2025-2026-1', '2025-2026 学年第一学期',
     DATE '2025-09-01', DATE '2026-01-18', 20, FALSE)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ── Class schedules ────────────────────────────────────────────────
-- entries = [{course_name, teacher, location, day_of_week (1=Mon..7=Sun),
--             start_period, end_period, weeks (int[]), color}]
-- Week numbers are relative to the term's start_date.

-- 软件 2301 班 (org_unit.id = 1002) — full week
INSERT INTO class_schedule (id, tenant_id, class_id, term_code, source, last_synced_at, entries)
VALUES (3101, '${tenant_id}', 1002, '2025-2026-2', 'manual', NULL,
'[
  {"course_name":"高等数学 A2","teacher":"张教授","location":"教 101","day_of_week":1,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#6366f1"},
  {"course_name":"操作系统","teacher":"陈老师","location":"实验楼 305","day_of_week":1,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#0891b2"},
  {"course_name":"数据库原理","teacher":"刘教授","location":"教 203","day_of_week":2,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#059669"},
  {"course_name":"软件工程","teacher":"王老师","location":"教 105","day_of_week":2,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#b45309"},
  {"course_name":"英语口语","teacher":"Smith","location":"语音 2","day_of_week":3,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#7c3aed"},
  {"course_name":"计算机网络","teacher":"赵教授","location":"教 207","day_of_week":3,"start_period":5,"end_period":6,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#0891b2"},
  {"course_name":"算法设计","teacher":"孙教授","location":"教 102","day_of_week":4,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#dc2626"},
  {"course_name":"体育","teacher":"林教练","location":"操场","day_of_week":4,"start_period":7,"end_period":8,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#16a34a"},
  {"course_name":"思政课","teacher":"周老师","location":"教 301","day_of_week":5,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#dc2626"}
]'::jsonb)
ON CONFLICT (tenant_id, class_id, term_code) DO NOTHING;

-- 汉语言 2301 班 (1004) — fewer entries to vary the demo
INSERT INTO class_schedule (id, tenant_id, class_id, term_code, source, last_synced_at, entries)
VALUES (3102, '${tenant_id}', 1004, '2025-2026-2', 'manual', NULL,
'[
  {"course_name":"古代汉语","teacher":"周教授","location":"文 102","day_of_week":1,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#b45309"},
  {"course_name":"现代文学","teacher":"陈老师","location":"文 203","day_of_week":2,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#7c3aed"},
  {"course_name":"语言学概论","teacher":"吴教授","location":"文 105","day_of_week":3,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#0891b2"},
  {"course_name":"写作","teacher":"林老师","location":"文 207","day_of_week":4,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#059669"},
  {"course_name":"思政课","teacher":"周老师","location":"教 301","day_of_week":5,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#dc2626"}
]'::jsonb)
ON CONFLICT (tenant_id, class_id, term_code) DO NOTHING;

-- 软件 2302 班 (1005) — same template as 1002 to demonstrate "shared by class"
INSERT INTO class_schedule (id, tenant_id, class_id, term_code, source, last_synced_at, entries)
VALUES (3103, '${tenant_id}', 1005, '2025-2026-2', 'manual', NULL,
'[
  {"course_name":"高等数学 A2","teacher":"张教授","location":"教 102","day_of_week":1,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#6366f1"},
  {"course_name":"操作系统","teacher":"陈老师","location":"实验楼 306","day_of_week":2,"start_period":1,"end_period":2,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#0891b2"},
  {"course_name":"数据库原理","teacher":"刘教授","location":"教 204","day_of_week":3,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#059669"},
  {"course_name":"算法设计","teacher":"孙教授","location":"教 103","day_of_week":4,"start_period":3,"end_period":4,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#dc2626"},
  {"course_name":"体育","teacher":"林教练","location":"操场","day_of_week":5,"start_period":7,"end_period":8,"weeks":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"color":"#16a34a"}
]'::jsonb)
ON CONFLICT (tenant_id, class_id, term_code) DO NOTHING;

-- ── Academic events ────────────────────────────────────────────────
INSERT INTO academic_event (id, tenant_id, term_code, event_type, name, start_date, end_date, granularity, notes)
VALUES
    -- 期末考试: granularity=month — 仅指定"6月"，UI 会显示"6 月（具体日期待定）"
    (3201, '${tenant_id}', '2025-2026-2', 'exam_final', '期末考试',
     DATE '2026-06-01', DATE '2026-06-30', 'month', '具体周次待教务通知'),
    -- 暑假: granularity=day
    (3202, '${tenant_id}', '2025-2026-2', 'holiday', '暑假',
     DATE '2026-07-13', DATE '2026-08-31', 'day', NULL),
    -- 端午
    (3203, '${tenant_id}', '2025-2026-2', 'holiday', '端午节',
     DATE '2026-06-19', DATE '2026-06-21', 'day', NULL),
    -- 已过的五一: 只为演示历史事件渲染
    (3204, '${tenant_id}', '2025-2026-2', 'holiday', '劳动节',
     DATE '2026-05-01', DATE '2026-05-05', 'day', NULL)
ON CONFLICT (id) DO NOTHING;
