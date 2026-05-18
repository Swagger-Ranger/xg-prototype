-- 主动关怀工作台 demo 数据：让"关怀工作台 / 院系管理视图 / 规则运维 / 学生小程序"
-- 在空库下也有数据可显，并覆盖 8 条规则 × 7 个任务状态 + 去重冷却 + AI brief + 下钻审计。
--
-- 沿用 V021/V027/V100/V101 demo 约定：
--   · '${tenant_id}' 占位由租户迁移 runner 替换；ON CONFLICT DO NOTHING 幂等。
--   · 复用现有 demo 花名册（V021/V027）：
--       学生(sys_user.id)= care_task.student_id 语义；2011-2015 属软件2301(org1002)→ 辅导员李老师 2001；
--       2016-2018 属软件2302(org1005)、2019-2020 属汉语言2301(org1004) → 辅导员王老师 2002。
--   · assigned_to / actor_id / submitted_by 均为 sys_user.id（与 student_event_log.student_id 同语义）。
--
-- ID 区间（避开已用：org 1xxx / user 2xxx / profile 3xxx / mapping 4xxx /
--           student_event_log 5001-5018 / notification 898x / org 12xxx）：
--   care_task 13001-13099 / care_task_audit 13201-13399 /
--   care_task_feedback 13501-13599 / task_ai_brief_history 13601-13699 /
--   student_event_log 13701-13799（仅供"手动扫描"链路 QA）。
--
-- 注意：本脚本直接 INSERT care_task，不经 NotificationOrchestrator —— 故 demo 任务
--      不会触发企微/站内通知（符合预期，通知联动需走 API 行为，见测试用例文档）。

-- 规则版本（与 CareRuleCatalog.RULE_VERSION 对齐；改规则集时同步）
-- p1-2026.05

-- ────────────────────────────────────────────────────────────────────────────
-- 1) care_task：8 条规则 × 全部 7 状态。trigger_data 结构对齐 CareRuleEngine：
--    COUNT 类→ matched_count/threshold；MULTI 类→ distinct_categories/threshold；
--    NO_FOLLOWUP 类→ no_talk_days。详情页展示时 service 会剥掉 rule_id/rule_version。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO care_task
    (id, tenant_id, student_id, rule_id, rule_version, severity, trigger_data,
     current_brief_id, status, assigned_to, due_at, accepted_at, accepted_by,
     reschedule_count, closed_at, closed_by, closed_reason, transferred_to,
     last_triggered_at, trigger_count, cooldown_until, created_at)
VALUES
-- ── 辅导员李老师 2001（软件2301班 学生 2011-2015）────────────────────────────
-- 13001 张晓明 R001 连续缺课 critical · pending · 已二次命中(merge)，brief 被审核拦截
(13001, '${tenant_id}', 2011, 'R001', 'p1-2026.05', 'critical',
 '{"rule_id":"R001","rule_name":"连续缺课","category":"学业","window_days":5,"rule_version":"p1-2026.05","matched_count":4,"threshold":3}'::jsonb,
 NULL, 'pending', 2001, NOW() + INTERVAL '20 hours', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NOW() - INTERVAL '1 day', 2, NULL, NOW() - INTERVAL '1 day'),

-- 13002 王丽华 R007 请假超期 high · accepted
(13002, '${tenant_id}', 2012, 'R007', 'p1-2026.05', 'high',
 '{"rule_id":"R007","rule_name":"请假超期","category":"生活","window_days":3,"rule_version":"p1-2026.05","matched_count":1,"threshold":1}'::jsonb,
 NULL, 'accepted', 2001, NOW() + INTERVAL '30 hours', NOW() - INTERVAL '6 hours', 2001,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '18 hours'),

-- 13003 陈思远 R006 重复违纪 critical · in_progress · 有 AI brief 历史(老→新)
(13003, '${tenant_id}', 2013, 'R006', 'p1-2026.05', 'critical',
 '{"rule_id":"R006","rule_name":"重复违纪","category":"行为","window_days":30,"rule_version":"p1-2026.05","matched_count":3,"threshold":2}'::jsonb,
 13601, 'in_progress', 2001, NOW() + INTERVAL '8 hours', NOW() - INTERVAL '2 days', 2001,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '2 days'),

-- 13004 刘婷婷 R012 隐性经济压力 medium · resolved（cooldown=closed+30d 仍生效）
(13004, '${tenant_id}', 2014, 'R012', 'p1-2026.05', 'medium',
 '{"rule_id":"R012","rule_name":"隐性经济压力","category":"勤工","window_days":30,"rule_version":"p1-2026.05","matched_count":3,"threshold":3}'::jsonb,
 NULL, 'resolved', 2001, NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 days', 2001,
 0, NOW() - INTERVAL '3 days', 2001, 'resolved', NULL,
 NULL, 1, (NOW() - INTERVAL '3 days') + INTERVAL '30 days', NOW() - INTERVAL '6 days'),

-- 13005 赵宇航 R011a 勤工履职异常(纪律) critical · overdue
(13005, '${tenant_id}', 2015, 'R011a', 'p1-2026.05', 'critical',
 '{"rule_id":"R011a","rule_name":"勤工履职异常（纪律）","category":"勤工","window_days":30,"rule_version":"p1-2026.05","matched_count":1,"threshold":1}'::jsonb,
 NULL, 'overdue', 2001, NOW() - INTERVAL '2 days', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '3 days'),

-- 13006 张晓明 R008 长期无跟进 low · pending（同生不同规则，与 13001 不冲突）
(13006, '${tenant_id}', 2011, 'R008', 'p1-2026.05', 'low',
 '{"rule_id":"R008","rule_name":"长期无跟进","category":"生活","window_days":60,"rule_version":"p1-2026.05","no_talk_days":60}'::jsonb,
 NULL, 'pending', 2001, NOW() + INTERVAL '14 days', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '2 days'),

-- 13007 王丽华 R006 重复违纪 critical · rejected（误报，带 feedback；cooldown=closed+14d）
(13007, '${tenant_id}', 2012, 'R006', 'p1-2026.05', 'critical',
 '{"rule_id":"R006","rule_name":"重复违纪","category":"行为","window_days":30,"rule_version":"p1-2026.05","matched_count":2,"threshold":2}'::jsonb,
 NULL, 'rejected', 2001, NOW() - INTERVAL '1 day', NULL, NULL,
 0, NOW() - INTERVAL '2 days', 2001, 'rule_not_applicable', NULL,
 NULL, 1, (NOW() - INTERVAL '2 days') + INTERVAL '14 days', NOW() - INTERVAL '3 days'),

-- ── 辅导员王老师 2002（软件2302班 2016-2018 / 汉语言2301班 2019-2020）──────────
-- 13008 孙志强 R009 多模块异常 critical · pending（跨类，distinct_categories）
(13008, '${tenant_id}', 2016, 'R009', 'p1-2026.05', 'critical',
 '{"rule_id":"R009","rule_name":"多模块异常","category":"跨类","window_days":30,"rule_version":"p1-2026.05","distinct_categories":3,"threshold":3}'::jsonb,
 NULL, 'pending', 2002, NOW() + INTERVAL '22 hours', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '2 hours'),

-- 13009 孙志强 R001 连续缺课 critical · accepted（同生不同规则，与 13008 不冲突）
(13009, '${tenant_id}', 2016, 'R001', 'p1-2026.05', 'critical',
 '{"rule_id":"R001","rule_name":"连续缺课","category":"学业","window_days":5,"rule_version":"p1-2026.05","matched_count":3,"threshold":3}'::jsonb,
 NULL, 'accepted', 2002, NOW() + INTERVAL '18 hours', NOW() - INTERVAL '3 hours', 2002,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '5 hours'),

-- 13010 周佳怡 R007 请假超期 high · in_progress · brief 脱敏后展示(redacted)
(13010, '${tenant_id}', 2017, 'R007', 'p1-2026.05', 'high',
 '{"rule_id":"R007","rule_name":"请假超期","category":"生活","window_days":3,"rule_version":"p1-2026.05","matched_count":1,"threshold":1}'::jsonb,
 13603, 'in_progress', 2002, NOW() + INTERVAL '10 hours', NOW() - INTERVAL '2 days', 2002,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '2 days'),

-- 13011 吴海涛 R011b 勤工履职异常(表现) medium · transferred → 心理中心
(13011, '${tenant_id}', 2018, 'R011b', 'p1-2026.05', 'medium',
 '{"rule_id":"R011b","rule_name":"勤工履职异常（表现）","category":"勤工","window_days":30,"rule_version":"p1-2026.05","matched_count":1,"threshold":1}'::jsonb,
 NULL, 'transferred', 2002, NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', 2002,
 0, NOW() - INTERVAL '1 day', 2002, 'transfer', 'counseling_center',
 NULL, 1, (NOW() - INTERVAL '1 day') + INTERVAL '30 days', NOW() - INTERVAL '4 days'),

-- 13012 郑雅琴 R006 重复违纪 critical · resolved
(13012, '${tenant_id}', 2019, 'R006', 'p1-2026.05', 'critical',
 '{"rule_id":"R006","rule_name":"重复违纪","category":"行为","window_days":30,"rule_version":"p1-2026.05","matched_count":2,"threshold":2}'::jsonb,
 NULL, 'resolved', 2002, NOW() - INTERVAL '4 days', NOW() - INTERVAL '6 days', 2002,
 0, NOW() - INTERVAL '5 days', 2002, 'resolved', NULL,
 NULL, 1, (NOW() - INTERVAL '5 days') + INTERVAL '14 days', NOW() - INTERVAL '7 days'),

-- 13013 冯梓睿 R012 隐性经济压力 medium · pending · 改期2次 → 院系"需要介入"视图
(13013, '${tenant_id}', 2020, 'R012', 'p1-2026.05', 'medium',
 '{"rule_id":"R012","rule_name":"隐性经济压力","category":"勤工","window_days":30,"rule_version":"p1-2026.05","matched_count":4,"threshold":3}'::jsonb,
 NULL, 'pending', 2002, NOW() + INTERVAL '5 days', NULL, NULL,
 2, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '6 days'),

-- 13014 周佳怡 R008 长期无跟进 low · pending（同生不同规则，与 13010 不冲突）
(13014, '${tenant_id}', 2017, 'R008', 'p1-2026.05', 'low',
 '{"rule_id":"R008","rule_name":"长期无跟进","category":"生活","window_days":60,"rule_version":"p1-2026.05","no_talk_days":60}'::jsonb,
 NULL, 'pending', 2002, NOW() + INTERVAL '14 days', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '1 day'),

-- 13015 吴海涛 R001 连续缺课 critical · overdue（供院系超期视图，同生不同规则不与 13011 冲突）
(13015, '${tenant_id}', 2018, 'R001', 'p1-2026.05', 'critical',
 '{"rule_id":"R001","rule_name":"连续缺课","category":"学业","window_days":5,"rule_version":"p1-2026.05","matched_count":5,"threshold":3}'::jsonb,
 NULL, 'overdue', 2002, NOW() - INTERVAL '1 day', NULL, NULL,
 0, NULL, NULL, NULL, NULL,
 NULL, 1, NULL, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) care_task_audit：状态机迁移流水 + 学生级下钻审计(drilled_down, V130 起 task_id 可空)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO care_task_audit
    (id, tenant_id, task_id, action, from_status, to_status, actor_id, actor_role, payload, created_at)
VALUES
(13201, '${tenant_id}', 13002, 'accept',       'pending',  'accepted',    2001, 'counselor', NULL, NOW() - INTERVAL '6 hours'),
(13202, '${tenant_id}', 13003, 'accept',       'pending',  'accepted',    2001, 'counselor', NULL, NOW() - INTERVAL '2 days'),
(13203, '${tenant_id}', 13003, 'save_followup','accepted', 'in_progress', 2001, 'counselor', '{"note":"已电话联系，约本周三当面谈一次"}'::jsonb, NOW() - INTERVAL '1 day'),
(13204, '${tenant_id}', 13004, 'accept',       'pending',  'accepted',    2001, 'counselor', NULL, NOW() - INTERVAL '5 days'),
(13205, '${tenant_id}', 13004, 'resolve',      'accepted', 'resolved',    2001, 'counselor', '{"note":"已面谈，确认勤工申请改报其他岗位，情绪稳定"}'::jsonb, NOW() - INTERVAL '3 days'),
(13206, '${tenant_id}', 13005, 'overdue_tick', 'pending',  'overdue',     NULL, NULL,        NULL, NOW() - INTERVAL '2 days'),
(13207, '${tenant_id}', 13007, 'reject',       'pending',  'rejected',    2001, 'counselor', '{"reason_code":"rule_not_applicable","reason_detail":"该生违纪记录系社团活动误报，已与学院核实"}'::jsonb, NOW() - INTERVAL '2 days'),
(13208, '${tenant_id}', 13009, 'accept',       'pending',  'accepted',    2002, 'counselor', NULL, NOW() - INTERVAL '3 hours'),
(13209, '${tenant_id}', 13010, 'accept',       'pending',  'accepted',    2002, 'counselor', NULL, NOW() - INTERVAL '2 days'),
(13210, '${tenant_id}', 13010, 'save_followup','accepted', 'in_progress', 2002, 'counselor', '{"note":"已了解请假原因为家庭事务，持续跟进"}'::jsonb, NOW() - INTERVAL '1 day'),
(13211, '${tenant_id}', 13011, 'accept',       'pending',  'accepted',    2002, 'counselor', NULL, NOW() - INTERVAL '3 days'),
(13212, '${tenant_id}', 13011, 'transfer',     'accepted', 'transferred', 2002, 'counselor', '{"target_dept":"counseling_center","reason_detail":"勤工表现波动伴随情绪低落，建议心理中心评估"}'::jsonb, NOW() - INTERVAL '1 day'),
(13213, '${tenant_id}', 13012, 'accept',       'pending',  'accepted',    2002, 'counselor', NULL, NOW() - INTERVAL '6 days'),
(13214, '${tenant_id}', 13012, 'resolve',      'accepted', 'resolved',    2002, 'counselor', '{"note":"违纪已处理完毕，家校沟通到位"}'::jsonb, NOW() - INTERVAL '5 days'),
(13215, '${tenant_id}', 13013, 'reschedule',   'pending',  'pending',     2002, 'counselor', '{"days":3}'::jsonb, NOW() - INTERVAL '4 days'),
(13216, '${tenant_id}', 13013, 'reschedule',   'pending',  'pending',     2002, 'counselor', '{"days":7}'::jsonb, NOW() - INTERVAL '1 day'),
(13217, '${tenant_id}', 13015, 'overdue_tick', 'pending',  'overdue',     NULL, NULL,        NULL, NOW() - INTERVAL '1 day'),
-- 学生级下钻审计（task_id/from_status/to_status 为空）：供下钻日志 + 周报异常检测
(13218, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2001, 'dean',         '{"student_id":"2016","reason":"孙志强近期多模块异常，院系例会需了解整体跟进情况，故下钻查看"}'::jsonb, NOW() - INTERVAL '2 days'),
(13219, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2001, 'dean',         '{"student_id":"2018","reason":"吴海涛勤工转介后需确认后续衔接，下钻核对处置链路是否闭环"}'::jsonb, NOW() - INTERVAL '1 day'),
(13220, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2002, 'school_admin', '{"student_id":"2011","reason":"信息化巡检：抽样核对关怀任务下钻审计链路是否完整可溯源"}'::jsonb, NOW() - INTERVAL '20 hours'),
(13221, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2002, 'school_admin', '{"student_id":"2012","reason":"信息化巡检：抽样核对关怀任务下钻审计链路是否完整可溯源"}'::jsonb, NOW() - INTERVAL '19 hours'),
(13222, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2002, 'school_admin', '{"student_id":"2013","reason":"信息化巡检：抽样核对关怀任务下钻审计链路是否完整可溯源"}'::jsonb, NOW() - INTERVAL '18 hours'),
(13223, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2002, 'school_admin', '{"student_id":"2014","reason":"信息化巡检：抽样核对关怀任务下钻审计链路是否完整可溯源"}'::jsonb, NOW() - INTERVAL '17 hours'),
(13224, '${tenant_id}', NULL, 'drilled_down', NULL, NULL, 2002, 'school_admin', '{"student_id":"2015","reason":"信息化巡检：抽样核对关怀任务下钻审计链路是否完整可溯源"}'::jsonb, NOW() - INTERVAL '16 hours')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) care_task_feedback：误报 / 拒绝原因 / 改进建议（喂回 30 天效果报表）
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO care_task_feedback
    (id, tenant_id, task_id, feedback_type, reason_code, reason_detail, submitted_by, submitted_at)
VALUES
(13501, '${tenant_id}', 13007, 'false_positive',         'rule_not_applicable', '违纪记录系社团活动误报，已与学院核实，规则对该生不适用', 2001, NOW() - INTERVAL '2 days'),
(13502, '${tenant_id}', 13004, 'improvement_suggestion', 'other',               '建议 R012 增加"是否已获其他资助"判断，减少对已受助学生的误报', 2001, NOW() - INTERVAL '3 days'),
(13503, '${tenant_id}', 13011, 'rejected_reason',        'handled_offline',     '已线下转交心理中心并当面沟通，任务转介关闭', 2002, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) task_ai_brief_history：append-only。brief 结构 = why / talking_points /
--    avoid_topics / campus_resources / follow_up_days（对齐 xg-ai schema.json）。
--    sanitize_result：pass 可展示 / redacted 脱敏后展示 / blocked 不展示且 current_brief_id 不指向。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_ai_brief_history
    (id, tenant_id, task_id, brief, generated_at, generation_trigger, prompt_version, llm_model, sanitize_result)
VALUES
-- 13003 的旧版 brief（已被 13601 取代，留作历史）
(13600, '${tenant_id}', 13003,
 '{"why":"近期有多次行为记录，建议主动了解近况。","talking_points":["最近的学习和生活节奏","参与社团/集体活动的感受","有没有需要协调的资源"],"avoid_topics":["处分定性","与同学的具体冲突细节"],"campus_resources":["学院学业辅导答疑","学生事务一站式服务"],"follow_up_days":7}'::jsonb,
 NOW() - INTERVAL '2 days', 'batch_06', 'care-brief-v1', 'deepseek-chat', 'pass'),
-- 13003 的当前 brief（current_brief_id=13601）
(13601, '${tenant_id}', 13003,
 '{"why":"该同学近一个月有数次行为提醒，已在跟进中，可继续保持沟通节奏。","talking_points":["本周状态和作息","课程进度是否需要帮助","对班级活动的参与意愿"],"avoid_topics":["翻旧账式追问","非本人可决定的处分结果"],"campus_resources":["朋辈互助小组","学业辅导中心(工作日下午)"],"follow_up_days":5}'::jsonb,
 NOW() - INTERVAL '12 hours', 'manual_refresh', 'care-brief-v1', 'deepseek-chat', 'pass'),
-- 13001 的 brief 被审核拦截（current_brief_id 仍为 NULL，前端走"小夕正在准备/暂不可用")
(13602, '${tenant_id}', 13001,
 '{"why":"内容因含不宜措辞被整体拦截。","talking_points":[],"avoid_topics":[],"campus_resources":[],"follow_up_days":3}'::jsonb,
 NOW() - INTERVAL '6 hours', 'batch_08', 'care-brief-v1', 'deepseek-chat', 'blocked'),
-- 13010 的 brief 部分脱敏后展示（current_brief_id=13603）
(13603, '${tenant_id}', 13010,
 '{"why":"近期请假节奏偏密，建议了解原因并给予必要支持。","talking_points":["近期请假涉及的实际困难","课业衔接是否需要协助","家庭/生活方面是否需要资源对接"],"avoid_topics":["对请假动机的质疑式追问"],"campus_resources":["辅导员一对一沟通","学生资助与帮扶咨询"],"follow_up_days":3}'::jsonb,
 NOW() - INTERVAL '1 day', 'batch_13', 'care-brief-v1', 'deepseek-chat', 'redacted')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) care_rule_setting：全局严重度偏移单行（offset=0，显式落库供规则运维页展示"已持久化"）
--    care_rule_config 不预置 —— 默认全启用；"停用规则后扫描跳过"由测试用例走 API 验证。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO care_rule_setting (tenant_id, severity_offset, updated_by, updated_at)
VALUES ('${tenant_id}', 0, 2001, NOW() - INTERVAL '10 days')
ON CONFLICT (tenant_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) student_event_log：仅供"手动触发扫描 POST /api/v1/care/scan"链路 QA。
--    覆盖 3 种扫描结果：① 新建  ② 命中已开任务→merge  ③ 命中冷却期→抑制。
--    （工作台展示靠上面 care_task 直插，不依赖这些事件。）
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO student_event_log
    (id, tenant_id, student_id, event_type, event_source, event_data, occurred_at, severity)
VALUES
-- ① 陈思远 2013：5d 内 3 次缺课 → 扫描应"新建"R001 任务（assigned_to 解析为 2001；与已有 R006/13003 不冲突）
(13701, '${tenant_id}', 2013, 'checkin_absent', 'checkin', '{"activity":"早自习"}'::jsonb, NOW() - INTERVAL '1 day',  6),
(13702, '${tenant_id}', 2013, 'checkin_absent', 'checkin', '{"activity":"专业课"}'::jsonb, NOW() - INTERVAL '2 days', 6),
(13703, '${tenant_id}', 2013, 'checkin_absent', 'checkin', '{"activity":"晚自习"}'::jsonb, NOW() - INTERVAL '4 days', 6),
-- ② 张晓明 2011：5d 内 3 次缺课，但已有 open R001 任务 13001 → 扫描应"merge"（trigger_count 累加，不新建）
(13704, '${tenant_id}', 2011, 'checkin_absent', 'checkin', '{"activity":"早自习"}'::jsonb, NOW() - INTERVAL '1 day',  6),
(13705, '${tenant_id}', 2011, 'checkin_absent', 'checkin', '{"activity":"体育课"}'::jsonb, NOW() - INTERVAL '3 days', 6),
(13706, '${tenant_id}', 2011, 'checkin_absent', 'checkin', '{"activity":"专业课"}'::jsonb, NOW() - INTERVAL '4 days', 6),
-- ③ 刘婷婷 2014：30d 内 3 次勤工申请被拒（触 R012），但 13004 刚 resolved 仍在 30d 冷却期 → 扫描应"抑制"，不新建
(13707, '${tenant_id}', 2014, 'workstudy_apply_rejected', 'workstudy', '{"position":"图书馆助理"}'::jsonb, NOW() - INTERVAL '2 days',  3),
(13708, '${tenant_id}', 2014, 'workstudy_apply_rejected', 'workstudy', '{"position":"行政助理"}'::jsonb,   NOW() - INTERVAL '6 days',  3),
(13709, '${tenant_id}', 2014, 'workstudy_apply_rejected', 'workstudy', '{"position":"实验室助管"}'::jsonb, NOW() - INTERVAL '10 days', 3)
ON CONFLICT (id) DO NOTHING;
