-- Demo seed for the 朝夕 校园 dashboard 本周日程 work-study slots.
-- Two long-term positions covering the entire 2025-2026-2 term, with
-- weekly-recurring time_slots so a hired student sees 勤工 rows in their
-- WeekAgenda every week. Three demo students are set to hired/pending/
-- recommended so the 我的勤工 card varies by quick-login account.
--
-- IDs:
--   employer:                4001
--   work_study_position:     4101 (图书馆参考室助理) / 4102 (行政办公室助理)
--   work_study_application:  4201..4204
--
-- Idempotent via ON CONFLICT.

-- ── Employer ────────────────────────────────────────────────────────
-- 后勤服务中心 — leader is the demo employer1 user (2201) seeded in V059.
INSERT INTO employer
    (id, tenant_id, name, leader_user_id, operator_user_ids,
     contact_name, contact_phone, email, status, allow_self_arrange)
VALUES
    (4001, '${tenant_id}', '后勤服务中心', 2201, '[]'::jsonb,
     '吴主管', '13800000006', 'employer@demo.edu', 'active', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── Positions ───────────────────────────────────────────────────────
-- time_slots covers the full term (no week filter — slots fire every week
-- the term is in session). work_location is what WeekAgenda actually shows.
INSERT INTO work_study_position
    (id, tenant_id, title, position_type, department_name, description, requirements,
     prefer_financial_aid, hourly_rate, weekly_hours, headcount, hired_count, status,
     start_date, end_date, creator_id,
     employer_id, academic_year, owner_user_id, owner_phone, campus, work_location,
     duration_months, time_slots, application_deadline, salary_unit, salary_amount,
     reason, self_arranged)
VALUES
(4101, '${tenant_id}', '图书馆参考室助理', 'fixed', '后勤服务中心',
 '协助图书馆老师整理参考书籍、引导读者查询、维护阅览秩序。', '熟悉图书分类，做事细心。',
 FALSE, 25.00, 9, 4, 1, 'open',
 DATE '2026-02-23', DATE '2026-07-12', 2201,
 4001, '2025-2026', 2201, '13800000006', '主校区', '图书馆三楼参考室',
 5,
 '[{"day":"mon","start":"14:00","end":"17:00"},
   {"day":"wed","start":"14:00","end":"17:00"},
   {"day":"fri","start":"14:00","end":"17:00"}]'::jsonb,
 TIMESTAMPTZ '2026-03-15 23:59:59+08', 'hour', 25.00,
 '图书馆人手不足，需要学生助理协助日常运营。', FALSE),

(4102, '${tenant_id}', '行政办公室助理', 'fixed', '后勤服务中心',
 '协助办公室处理日常文书、接待来访、整理档案。', '细致认真，熟悉 Office。',
 FALSE, 22.00, 6, 3, 1, 'open',
 DATE '2026-02-23', DATE '2026-07-12', 2201,
 4001, '2025-2026', 2201, '13800000006', '主校区', '行政楼 B201',
 5,
 '[{"day":"tue","start":"09:00","end":"12:00"},
   {"day":"thu","start":"09:00","end":"12:00"}]'::jsonb,
 TIMESTAMPTZ '2026-03-15 23:59:59+08', 'hour', 22.00,
 '行政办公室档案整理需要长期助理。', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── Applications ────────────────────────────────────────────────────
-- stu_zhang(2011) 在岗 → 4101 (图书馆，周一三五下午)
-- stu_wang(2012)  在岗 → 4102 (行政办公室，周二四上午)
-- stu_chen(2013)  待审核 → 4101
-- stu_liu(2014)   已推荐 → 4102
-- stu_zhao(2015)  没申请，用作"无勤工"对照
INSERT INTO work_study_application
    (id, tenant_id, position_id, student_id, student_name, financial_aid_level,
     intro, status, decision_note, decided_by, decided_at, created_at, updated_at)
VALUES
(4201, '${tenant_id}', 4101, 2011, '张晓明', NULL,
 '希望参与图书馆服务，时间能配合周一三五。',
 'hired', '面试通过，安排周一三五下午班。',
 2201, TIMESTAMPTZ '2026-02-25 10:00:00+08',
 TIMESTAMPTZ '2026-02-23 09:00:00+08', TIMESTAMPTZ '2026-02-25 10:00:00+08'),

(4202, '${tenant_id}', 4102, 2012, '王丽华', NULL,
 '细致认真，希望长期参与档案整理工作。',
 'hired', '安排周二四上午班。',
 2201, TIMESTAMPTZ '2026-02-26 10:00:00+08',
 TIMESTAMPTZ '2026-02-23 10:00:00+08', TIMESTAMPTZ '2026-02-26 10:00:00+08'),

(4203, '${tenant_id}', 4101, 2013, '陈思远', NULL,
 '想锻炼自己，希望参加图书馆服务。',
 'pending', NULL, NULL, NULL,
 TIMESTAMPTZ '2026-04-15 14:30:00+08', TIMESTAMPTZ '2026-04-15 14:30:00+08'),

(4204, '${tenant_id}', 4102, 2014, '刘婷婷', NULL,
 '希望积累工作经验。',
 'recommended', '简历不错，等用人单位面试。', 2201,
 TIMESTAMPTZ '2026-04-22 16:00:00+08',
 TIMESTAMPTZ '2026-04-20 11:00:00+08', TIMESTAMPTZ '2026-04-22 16:00:00+08')
ON CONFLICT (id) DO NOTHING;
