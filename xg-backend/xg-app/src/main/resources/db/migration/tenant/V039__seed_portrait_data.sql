-- Seed portrait facts (violations / punishments / counselor talks / alerts) so the
-- student profile page has data to render. Keys `student_id` against sys_user.id
-- (the convention every fact table already uses).
--
-- Target 14 seeded students across existing colleges; IDs are stable so the
-- migration is idempotent via ON CONFLICT.

-- ============================================================================
-- 1. violation_record — 20 rows, mixed categories and approval statuses
-- ============================================================================
INSERT INTO violation_record (id, tenant_id, student_id, student_name, category, occurred_at, location, description, recorder_id, recorder_name, approval_status, submitted_at, approved_at, approver_id, approver_name) VALUES
  (5000, '${tenant_id}', 2011, '张晓明',  'absence',        NOW() - INTERVAL '45 days', '教学楼 A301', '连续旷课 3 节，未请假',                2001, '李老师', 'approved', NOW() - INTERVAL '44 days', NOW() - INTERVAL '43 days', 2001, '李老师'),
  (5001, '${tenant_id}', 2011, '张晓明',  'dorm_violation', NOW() - INTERVAL '30 days', '男生宿舍 6-302', '夜不归宿一次',                      2001, '李老师', 'approved', NOW() - INTERVAL '29 days', NOW() - INTERVAL '28 days', 2001, '李老师'),
  (5002, '${tenant_id}', 2011, '张晓明',  'absence',        NOW() - INTERVAL '15 days', '教学楼 A301', '迟到 20 分钟',                          2001, '李老师', 'pending',  NOW() - INTERVAL '14 days', NULL, NULL, NULL),
  (5003, '${tenant_id}', 2105, '林逸辰',  'dorm_violation', NOW() - INTERVAL '60 days', '男生宿舍 7-105', '熄灯后使用大功率电器',               2001, '李老师', 'approved', NOW() - INTERVAL '59 days', NOW() - INTERVAL '58 days', 2001, '李老师'),
  (5004, '${tenant_id}', 2105, '林逸辰',  'absence',        NOW() - INTERVAL '20 days', '教学楼 B205', '无故缺课 2 节',                         2001, '李老师', 'approved', NOW() - INTERVAL '19 days', NOW() - INTERVAL '18 days', 2001, '李老师'),
  (5005, '${tenant_id}', 2115, '秦浩宇',  'fighting',       NOW() - INTERVAL '90 days', '宿舍楼楼道', '与同学发生肢体冲突',                     2002, '王老师', 'approved', NOW() - INTERVAL '89 days', NOW() - INTERVAL '88 days', 2002, '王老师'),
  (5006, '${tenant_id}', 2115, '秦浩宇',  'other',          NOW() - INTERVAL '25 days', '食堂', '插队并言语冲突',                               2002, '王老师', 'approved', NOW() - INTERVAL '24 days', NOW() - INTERVAL '23 days', 2002, '王老师'),
  (5007, '${tenant_id}', 2017, '周佳怡',  'absence',        NOW() - INTERVAL '10 days', '教学楼 A201', '未到场听课一次',                        2001, '李老师', 'pending',  NOW() - INTERVAL '9 days',  NULL, NULL, NULL),
  (5008, '${tenant_id}', 2301, '孙奕辰',  'dorm_violation', NOW() - INTERVAL '50 days', '男生宿舍 8-401', '私自留宿校外人员',                   2001, '李老师', 'approved', NOW() - INTERVAL '49 days', NOW() - INTERVAL '48 days', 2001, '李老师'),
  (5009, '${tenant_id}', 2302, '李昊然',  'absence',        NOW() - INTERVAL '40 days', '实训车间', '实训课旷课一次',                             2002, '王老师', 'approved', NOW() - INTERVAL '39 days', NOW() - INTERVAL '38 days', 2002, '王老师'),
  (5010, '${tenant_id}', 2308, '韩梦瑶',  'other',          NOW() - INTERVAL '22 days', '图书馆', '阅览室大声喧哗',                             2001, '李老师', 'rejected', NOW() - INTERVAL '21 days', NOW() - INTERVAL '20 days', 2001, '李老师'),
  (5011, '${tenant_id}', 2309, '罗子豪',  'absence',        NOW() - INTERVAL '35 days', '教学楼 C105', '三次迟到',                                2001, '李老师', 'approved', NOW() - INTERVAL '34 days', NOW() - INTERVAL '33 days', 2001, '李老师'),
  (5012, '${tenant_id}', 2309, '罗子豪',  'exam_cheat',     NOW() - INTERVAL '120 days', '考场 3-201', '携带小抄入场',                           2002, '王老师', 'approved', NOW() - INTERVAL '119 days', NOW() - INTERVAL '118 days', 2002, '王老师'),
  (5013, '${tenant_id}', 2312, '莫晨宇',  'dorm_violation', NOW() - INTERVAL '18 days', '男生宿舍 9-203', '宿舍内吸烟',                         2001, '李老师', 'approved', NOW() - INTERVAL '17 days', NOW() - INTERVAL '16 days', 2001, '李老师'),
  (5014, '${tenant_id}', 2316, '郭雨桐',  'absence',        NOW() - INTERVAL '12 days', '教学楼 D101', '迟到 30 分钟',                           2002, '王老师', 'pending',  NOW() - INTERVAL '11 days', NULL, NULL, NULL),
  (5015, '${tenant_id}', 2319, '邱紫萱',  'absence',        NOW() - INTERVAL '28 days', '教学楼 D305', '旷课半天',                                2002, '王老师', 'approved', NOW() - INTERVAL '27 days', NOW() - INTERVAL '26 days', 2002, '王老师'),
  (5016, '${tenant_id}', 2323, '苏语彤',  'other',          NOW() - INTERVAL '8 days',  '操场', '未经允许擅自离校',                                2001, '李老师', 'draft',    NULL, NULL, NULL, NULL),
  (5017, '${tenant_id}', 2330, '项书言',  'dorm_violation', NOW() - INTERVAL '14 days', '男生宿舍 6-105', '未按时就寝',                         2001, '李老师', 'approved', NOW() - INTERVAL '13 days', NOW() - INTERVAL '12 days', 2001, '李老师'),
  (5018, '${tenant_id}', 2334, '孔清越',  'other',          NOW() - INTERVAL '6 days',  '艺术楼 B101', '擅用专业教室器材',                         2002, '王老师', 'pending',  NOW() - INTERVAL '5 days',  NULL, NULL, NULL),
  (5019, '${tenant_id}', 2017, '周佳怡',  'dorm_violation', NOW() - INTERVAL '70 days', '女生宿舍 3-205', '使用违禁电器',                       2001, '李老师', 'approved', NOW() - INTERVAL '69 days', NOW() - INTERVAL '68 days', 2001, '李老师')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. punishment — 6 rows, warning/serious_warning/demerit, effective + lifted
-- ============================================================================
INSERT INTO punishment (id, tenant_id, violation_record_id, student_id, student_name, level, reason, effective_date, expiry_date, status, issuer_id, issuer_name) VALUES
  (5100, '${tenant_id}', 5001, 2011, '张晓明',  'warning',         '夜不归宿一次，违反学生管理规定',                (CURRENT_DATE - INTERVAL '28 days')::DATE, (CURRENT_DATE + INTERVAL '60 days')::DATE,  'effective', 2001, '李老师'),
  (5101, '${tenant_id}', 5005, 2115, '秦浩宇',  'serious_warning', '与同学发生肢体冲突，造成不良影响',              (CURRENT_DATE - INTERVAL '88 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE,  'lifted',    2002, '王老师'),
  (5102, '${tenant_id}', 5012, 2309, '罗子豪',  'demerit',         '考试违纪携带小抄',                              (CURRENT_DATE - INTERVAL '118 days')::DATE,(CURRENT_DATE + INTERVAL '180 days')::DATE, 'effective', 2002, '王老师'),
  (5103, '${tenant_id}', 5003, 2105, '林逸辰',  'warning',         '宿舍使用违禁大功率电器',                        (CURRENT_DATE - INTERVAL '58 days')::DATE, (CURRENT_DATE + INTERVAL '30 days')::DATE,  'effective', 2001, '李老师'),
  (5104, '${tenant_id}', 5008, 2301, '孙奕辰',  'warning',         '私自留宿校外人员',                              (CURRENT_DATE - INTERVAL '48 days')::DATE, (CURRENT_DATE + INTERVAL '40 days')::DATE,  'effective', 2001, '李老师'),
  (5105, '${tenant_id}', 5013, 2312, '莫晨宇',  'warning',         '宿舍内吸烟',                                    (CURRENT_DATE - INTERVAL '16 days')::DATE, (CURRENT_DATE + INTERVAL '75 days')::DATE,  'effective', 2001, '李老师')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. counselor_talk — 15 rows, 5 topics
-- ============================================================================
INSERT INTO counselor_talk (id, tenant_id, student_id, student_name, counselor_id, counselor_name, topic, content, follow_up, talk_at) VALUES
  (5300, '${tenant_id}', 2011, '张晓明', 2001, '李老师', 'discipline', '就近期旷课与夜不归宿情况进行批评教育，学生承认错误。',     '一个月内每周主动汇报出勤情况。', NOW() - INTERVAL '27 days'),
  (5301, '${tenant_id}', 2011, '张晓明', 2001, '李老师', 'academic',   '本学期高数与离散数学成绩下滑，了解到学习方法问题。',         '推荐参加学习小组，下次月考后再谈。', NOW() - INTERVAL '10 days'),
  (5302, '${tenant_id}', 2105, '林逸辰', 2001, '李老师', 'discipline', '提醒宿舍违规行为带来的安全隐患。',                           '同寝室进行一次安全检查。',             NOW() - INTERVAL '55 days'),
  (5303, '${tenant_id}', 2105, '林逸辰', 2001, '李老师', 'mental',     '学生近期情绪低落，谈及家庭经济压力。',                       '联系学生资助中心评估困难补助资格。',   NOW() - INTERVAL '12 days'),
  (5304, '${tenant_id}', 2115, '秦浩宇', 2002, '王老师', 'discipline', '就打架事件进行严肃谈话，双方已和解。',                       '每两周面谈一次，持续三个月。',         NOW() - INTERVAL '85 days'),
  (5305, '${tenant_id}', 2115, '秦浩宇', 2002, '王老师', 'career',     '大三阶段规划讨论：实习 vs 考研。',                           '下月提交个人规划书。',                 NOW() - INTERVAL '7 days'),
  (5306, '${tenant_id}', 2017, '周佳怡', 2001, '李老师', 'academic',   '提及期中考试焦虑，讨论时间管理。',                           '尝试番茄工作法，两周后反馈。',         NOW() - INTERVAL '8 days'),
  (5307, '${tenant_id}', 2301, '孙奕辰', 2001, '李老师', 'academic',   '大四毕业论文进度较慢，了解选题困难。',                       '与导师约定每周进度检查。',             NOW() - INTERVAL '20 days'),
  (5308, '${tenant_id}', 2302, '李昊然', 2002, '王老师', 'career',     '机械专业就业意向讨论。',                                     '推荐参加校内双选会。',                 NOW() - INTERVAL '35 days'),
  (5309, '${tenant_id}', 2308, '韩梦瑶', 2001, '李老师', 'mental',     '新生适应谈话，表示同寝室关系紧张。',                         '组织班级团建活动。',                   NOW() - INTERVAL '40 days'),
  (5310, '${tenant_id}', 2309, '罗子豪', 2002, '王老师', 'discipline', '考试违纪后的深入谈话，分析诚信重要性。',                     '每学期考试前进行诚信教育。',           NOW() - INTERVAL '115 days'),
  (5311, '${tenant_id}', 2316, '郭雨桐', 2002, '王老师', 'other',      '家庭情况变化对学习的影响。',                                 NULL,                                   NOW() - INTERVAL '9 days'),
  (5312, '${tenant_id}', 2319, '邱紫萱', 2002, '王老师', 'academic',   '微积分挂科补考准备情况。',                                   '安排学业帮扶学长。',                   NOW() - INTERVAL '25 days'),
  (5313, '${tenant_id}', 2323, '苏语彤', 2001, '李老师', 'mental',     '恋爱困扰导致情绪波动，进行疏导。',                           '如持续加重建议转介心理中心。',         NOW() - INTERVAL '5 days'),
  (5314, '${tenant_id}', 2330, '项书言', 2001, '李老师', 'discipline', '宿舍作息问题谈话。',                                         '两周后回访。',                         NOW() - INTERVAL '11 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. student_alert — 12 rows, mix severity/status
-- alert_rule_id: 1 请假频繁 / 2 近期违纪 / 4 迟到模式 / 5 多模块异常
-- ============================================================================
INSERT INTO student_alert (id, tenant_id, student_id, alert_rule_id, rule_name, severity, trigger_data, status, acknowledged_by, acknowledged_at, resolved_at, note, created_at) VALUES
  (5200, '${tenant_id}', 2011, 2, '近期违纪',   'high',     '{"count": 3, "window_days": 45}'::jsonb,         'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '3 days'),
  (5201, '${tenant_id}', 2011, 4, '迟到模式',   'medium',   '{"late_count": 5, "window_days": 30}'::jsonb,    'acknowledged',    2001, NOW() - INTERVAL '2 days', NULL, '已约谈', NOW() - INTERVAL '4 days'),
  (5202, '${tenant_id}', 2105, 1, '请假频繁',   'medium',   '{"leave_count": 6, "window_days": 30}'::jsonb,   'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '2 days'),
  (5203, '${tenant_id}', 2105, 5, '多模块异常', 'critical', '{"modules": ["leave","violation"]}'::jsonb,      'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '1 days'),
  (5204, '${tenant_id}', 2115, 2, '近期违纪',   'high',     '{"count": 2, "window_days": 90}'::jsonb,         'resolved',        2002, NOW() - INTERVAL '88 days', NOW() - INTERVAL '85 days', '已处分', NOW() - INTERVAL '89 days'),
  (5205, '${tenant_id}', 2017, 4, '迟到模式',   'medium',   '{"late_count": 4, "window_days": 30}'::jsonb,    'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '5 days'),
  (5206, '${tenant_id}', 2301, 1, '请假频繁',   'low',      '{"leave_count": 4, "window_days": 30}'::jsonb,   'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '6 days'),
  (5207, '${tenant_id}', 2309, 5, '多模块异常', 'critical', '{"modules": ["violation","exam"]}'::jsonb,       'resolved',        2002, NOW() - INTERVAL '118 days', NOW() - INTERVAL '115 days', '已处分记过', NOW() - INTERVAL '119 days'),
  (5208, '${tenant_id}', 2312, 2, '近期违纪',   'medium',   '{"count": 1, "window_days": 30}'::jsonb,         'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '2 days'),
  (5209, '${tenant_id}', 2316, 4, '迟到模式',   'low',      '{"late_count": 3, "window_days": 30}'::jsonb,    'open',            NULL, NULL, NULL, NULL,         NOW() - INTERVAL '7 days'),
  (5210, '${tenant_id}', 2323, 1, '请假频繁',   'medium',   '{"leave_count": 5, "window_days": 30}'::jsonb,   'acknowledged',    2001, NOW() - INTERVAL '3 days', NULL, '排查中',    NOW() - INTERVAL '4 days'),
  (5211, '${tenant_id}', 2334, 4, '迟到模式',   'low',      '{"late_count": 3, "window_days": 30}'::jsonb,    'false_positive',  2002, NOW() - INTERVAL '1 days', NULL, '实训课特殊安排', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- Link one talk back to its triggering alert (counselor_talk.source_alert_id)
UPDATE counselor_talk SET source_alert_id = 5200 WHERE id = 5300;
UPDATE counselor_talk SET source_alert_id = 5202 WHERE id = 5302;
