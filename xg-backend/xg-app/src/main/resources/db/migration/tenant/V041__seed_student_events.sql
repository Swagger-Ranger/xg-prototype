-- Seed student_event_log so the 行为/事件时间线 tab in student profile renders a rich
-- timeline. Mirrors the shape StudentEventPublisher writes at runtime (event_type
-- codes from StudentEventType enum; event_data is a free-form JSONB payload).

INSERT INTO student_event_log (id, tenant_id, student_id, event_type, event_source, event_data, occurred_at, severity) VALUES
  -- 张晓明 2011 — flagship demo student (rich timeline)
  (5500, '${tenant_id}', 2011, 'leave_submit',             'leave',        '{"leave_type":"sick","days":1,"reason":"发烧"}'::jsonb,                           NOW() - INTERVAL '58 days', 2),
  (5501, '${tenant_id}', 2011, 'checkin_late',             'checkin',      '{"course":"高等数学","late_minutes":12}'::jsonb,                                   NOW() - INTERVAL '50 days', 4),
  (5502, '${tenant_id}', 2011, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5000}'::jsonb,                                  NOW() - INTERVAL '45 days', 7),
  (5503, '${tenant_id}', 2011, 'checkin_absent',           'checkin',      '{"course":"数据结构","absent_count":1}'::jsonb,                                    NOW() - INTERVAL '42 days', 6),
  (5504, '${tenant_id}', 2011, 'leave_rejected',           'leave',        '{"reason":"请假理由不充分"}'::jsonb,                                               NOW() - INTERVAL '38 days', 4),
  (5505, '${tenant_id}', 2011, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5001}'::jsonb,                            NOW() - INTERVAL '30 days', 7),
  (5506, '${tenant_id}', 2011, 'counselor_talk_recorded',  'counselor_talk','{"topic":"discipline","talk_id":5300}'::jsonb,                                    NOW() - INTERVAL '27 days', 1),
  (5507, '${tenant_id}', 2011, 'notification_unconfirmed', 'notification', '{"notification_title":"返校安全提醒"}'::jsonb,                                      NOW() - INTERVAL '20 days', 3),
  (5508, '${tenant_id}', 2011, 'checkin_late',             'checkin',      '{"course":"离散数学","late_minutes":20}'::jsonb,                                   NOW() - INTERVAL '15 days', 4),
  (5509, '${tenant_id}', 2011, 'notification_confirmed',   'notification', '{"notification_title":"选课通知"}'::jsonb,                                         NOW() - INTERVAL '12 days', 0),
  (5510, '${tenant_id}', 2011, 'counselor_talk_recorded',  'counselor_talk','{"topic":"academic","talk_id":5301}'::jsonb,                                      NOW() - INTERVAL '10 days', 1),
  (5511, '${tenant_id}', 2011, 'checkin_late',             'checkin',      '{"course":"高等数学","late_minutes":8}'::jsonb,                                    NOW() - INTERVAL '7 days',  4),
  (5512, '${tenant_id}', 2011, 'leave_submit',             'leave',        '{"leave_type":"personal","days":1,"reason":"家中有事"}'::jsonb,                    NOW() - INTERVAL '4 days',  2),
  (5513, '${tenant_id}', 2011, 'collection_filled',        'collection',   '{"collection_title":"返校信息登记"}'::jsonb,                                        NOW() - INTERVAL '2 days',  0),

  -- 林逸辰 2105
  (5520, '${tenant_id}', 2105, 'leave_submit',             'leave',        '{"leave_type":"sick","days":2}'::jsonb,                                            NOW() - INTERVAL '70 days', 2),
  (5521, '${tenant_id}', 2105, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5003}'::jsonb,                            NOW() - INTERVAL '60 days', 7),
  (5522, '${tenant_id}', 2105, 'counselor_talk_recorded',  'counselor_talk','{"topic":"discipline","talk_id":5302}'::jsonb,                                    NOW() - INTERVAL '55 days', 1),
  (5523, '${tenant_id}', 2105, 'leave_submit',             'leave',        '{"leave_type":"personal","days":1}'::jsonb,                                        NOW() - INTERVAL '35 days', 2),
  (5524, '${tenant_id}', 2105, 'leave_submit',             'leave',        '{"leave_type":"sick","days":3}'::jsonb,                                            NOW() - INTERVAL '25 days', 2),
  (5525, '${tenant_id}', 2105, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5004}'::jsonb,                                   NOW() - INTERVAL '20 days', 7),
  (5526, '${tenant_id}', 2105, 'counselor_talk_recorded',  'counselor_talk','{"topic":"mental","talk_id":5303}'::jsonb,                                        NOW() - INTERVAL '12 days', 1),
  (5527, '${tenant_id}', 2105, 'leave_submit',             'leave',        '{"leave_type":"personal","days":1}'::jsonb,                                        NOW() - INTERVAL '6 days',  2),

  -- 秦浩宇 2115
  (5530, '${tenant_id}', 2115, 'violation_recorded',       'violation',    '{"category":"fighting","record_id":5005}'::jsonb,                                  NOW() - INTERVAL '90 days', 7),
  (5531, '${tenant_id}', 2115, 'counselor_talk_recorded',  'counselor_talk','{"topic":"discipline","talk_id":5304}'::jsonb,                                    NOW() - INTERVAL '85 days', 1),
  (5532, '${tenant_id}', 2115, 'checkin_absent',           'checkin',      '{"course":"体育","absent_count":1}'::jsonb,                                        NOW() - INTERVAL '40 days', 6),
  (5533, '${tenant_id}', 2115, 'violation_recorded',       'violation',    '{"category":"other","record_id":5006}'::jsonb,                                     NOW() - INTERVAL '25 days', 7),
  (5534, '${tenant_id}', 2115, 'notification_confirmed',   'notification', '{"notification_title":"期末考试安排"}'::jsonb,                                      NOW() - INTERVAL '15 days', 0),
  (5535, '${tenant_id}', 2115, 'counselor_talk_recorded',  'counselor_talk','{"topic":"career","talk_id":5305}'::jsonb,                                        NOW() - INTERVAL '7 days',  1),
  (5536, '${tenant_id}', 2115, 'collection_filled',        'collection',   '{"collection_title":"就业意向调查"}'::jsonb,                                        NOW() - INTERVAL '5 days',  0),

  -- 周佳怡 2017
  (5540, '${tenant_id}', 2017, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5019}'::jsonb,                            NOW() - INTERVAL '70 days', 7),
  (5541, '${tenant_id}', 2017, 'leave_submit',             'leave',        '{"leave_type":"sick","days":1}'::jsonb,                                            NOW() - INTERVAL '30 days', 2),
  (5542, '${tenant_id}', 2017, 'checkin_late',             'checkin',      '{"course":"英语","late_minutes":5}'::jsonb,                                        NOW() - INTERVAL '18 days', 4),
  (5543, '${tenant_id}', 2017, 'counselor_talk_recorded',  'counselor_talk','{"topic":"academic","talk_id":5306}'::jsonb,                                      NOW() - INTERVAL '8 days',  1),
  (5544, '${tenant_id}', 2017, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5007}'::jsonb,                                   NOW() - INTERVAL '10 days', 7),

  -- 孙奕辰 2301
  (5550, '${tenant_id}', 2301, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5008}'::jsonb,                            NOW() - INTERVAL '50 days', 7),
  (5551, '${tenant_id}', 2301, 'counselor_talk_recorded',  'counselor_talk','{"topic":"academic","talk_id":5307}'::jsonb,                                      NOW() - INTERVAL '20 days', 1),
  (5552, '${tenant_id}', 2301, 'leave_submit',             'leave',        '{"leave_type":"personal","days":2}'::jsonb,                                        NOW() - INTERVAL '10 days', 2),

  -- 李昊然 2302
  (5555, '${tenant_id}', 2302, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5009}'::jsonb,                                   NOW() - INTERVAL '40 days', 7),
  (5556, '${tenant_id}', 2302, 'counselor_talk_recorded',  'counselor_talk','{"topic":"career","talk_id":5308}'::jsonb,                                        NOW() - INTERVAL '35 days', 1),
  (5557, '${tenant_id}', 2302, 'notification_unconfirmed', 'notification', '{"notification_title":"实训安全告知"}'::jsonb,                                      NOW() - INTERVAL '12 days', 3),

  -- 韩梦瑶 2308
  (5560, '${tenant_id}', 2308, 'counselor_talk_recorded',  'counselor_talk','{"topic":"mental","talk_id":5309}'::jsonb,                                        NOW() - INTERVAL '40 days', 1),
  (5561, '${tenant_id}', 2308, 'violation_recorded',       'violation',    '{"category":"other","record_id":5010}'::jsonb,                                     NOW() - INTERVAL '22 days', 7),
  (5562, '${tenant_id}', 2308, 'checkin_late',             'checkin',      '{"course":"英语","late_minutes":10}'::jsonb,                                       NOW() - INTERVAL '14 days', 4),

  -- 罗子豪 2309
  (5565, '${tenant_id}', 2309, 'violation_recorded',       'violation',    '{"category":"exam_cheat","record_id":5012}'::jsonb,                                NOW() - INTERVAL '120 days', 7),
  (5566, '${tenant_id}', 2309, 'counselor_talk_recorded',  'counselor_talk','{"topic":"discipline","talk_id":5310}'::jsonb,                                    NOW() - INTERVAL '115 days', 1),
  (5567, '${tenant_id}', 2309, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5011}'::jsonb,                                   NOW() - INTERVAL '35 days', 7),
  (5568, '${tenant_id}', 2309, 'notification_confirmed',   'notification', '{"notification_title":"补考通知"}'::jsonb,                                          NOW() - INTERVAL '10 days', 0),

  -- 莫晨宇 2312
  (5570, '${tenant_id}', 2312, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5013}'::jsonb,                            NOW() - INTERVAL '18 days', 7),
  (5571, '${tenant_id}', 2312, 'checkin_absent',           'checkin',      '{"course":"高数","absent_count":1}'::jsonb,                                        NOW() - INTERVAL '9 days',  6),

  -- 郭雨桐 2316
  (5575, '${tenant_id}', 2316, 'checkin_late',             'checkin',      '{"course":"会计学","late_minutes":30}'::jsonb,                                     NOW() - INTERVAL '12 days', 4),
  (5576, '${tenant_id}', 2316, 'counselor_talk_recorded',  'counselor_talk','{"topic":"other","talk_id":5311}'::jsonb,                                         NOW() - INTERVAL '9 days',  1),

  -- 邱紫萱 2319
  (5580, '${tenant_id}', 2319, 'violation_recorded',       'violation',    '{"category":"absence","record_id":5015}'::jsonb,                                   NOW() - INTERVAL '28 days', 7),
  (5581, '${tenant_id}', 2319, 'counselor_talk_recorded',  'counselor_talk','{"topic":"academic","talk_id":5312}'::jsonb,                                      NOW() - INTERVAL '25 days', 1),

  -- 苏语彤 2323
  (5585, '${tenant_id}', 2323, 'leave_submit',             'leave',        '{"leave_type":"sick","days":2}'::jsonb,                                            NOW() - INTERVAL '14 days', 2),
  (5586, '${tenant_id}', 2323, 'counselor_talk_recorded',  'counselor_talk','{"topic":"mental","talk_id":5313}'::jsonb,                                        NOW() - INTERVAL '5 days',  1),

  -- 项书言 2330
  (5590, '${tenant_id}', 2330, 'violation_recorded',       'violation',    '{"category":"dorm_violation","record_id":5017}'::jsonb,                            NOW() - INTERVAL '14 days', 7),
  (5591, '${tenant_id}', 2330, 'counselor_talk_recorded',  'counselor_talk','{"topic":"discipline","talk_id":5314}'::jsonb,                                    NOW() - INTERVAL '11 days', 1),

  -- 孔清越 2334
  (5595, '${tenant_id}', 2334, 'collection_filled',        'collection',   '{"collection_title":"艺术展作品登记"}'::jsonb,                                      NOW() - INTERVAL '20 days', 0),
  (5596, '${tenant_id}', 2334, 'notification_confirmed',   'notification', '{"notification_title":"艺术节排练"}'::jsonb,                                        NOW() - INTERVAL '15 days', 0)
ON CONFLICT (id) DO NOTHING;
