-- 补 V074 之外缺失的两个学生侧进展状态：rejected + offboarded
-- 都挂在 stu_zhao(2015) 名下，登录后能在「我的申请」一次看到两种"非在岗"行
-- 的进展列和详情展开样式。
--
-- 这俩 row workflow_instance_id 留空，详情展开会走"无审批流（历史导入或直接录用）"
-- 分支 — 正好是用户想看的那种情况。
--
-- IDs: 4205 = rejected, 4206 = hired→offboarded

INSERT INTO work_study_application
    (id, tenant_id, position_id, student_id, student_name, financial_aid_level,
     intro, status, decision_note, decided_by, decided_at,
     engagement_status, engaged_at, offboarded_at, offboard_reason, offboard_note,
     created_at, updated_at)
VALUES
-- ── 4205：rejected 状态，带驳回原因（展开后会显示红色驳回说明块）──
(4205, '${tenant_id}', 4101, 2015, '赵宇航',  NULL,
 '想做图书馆助理但还没怎么接触过分类编目，希望能学。',
 'rejected',
 '本批次主要招熟悉图书分类的同学，建议先去图书馆当志愿者一段时间再申。',
 2201, TIMESTAMPTZ '2026-04-10 14:30:00+08',
 NULL, NULL, NULL, NULL, NULL,
 TIMESTAMPTZ '2026-04-08 09:00:00+08', TIMESTAMPTZ '2026-04-10 14:30:00+08'),

-- ── 4206：hired → 已离岗，带离岗原因（展开后显示离岗备注）──
(4206, '${tenant_id}', 4102, 2015, '赵宇航',  NULL,
 '希望参与行政档案整理工作，时间能配合周二四上午。',
 'hired',
 '面试通过，安排周二四上午班。',
 2201, TIMESTAMPTZ '2026-03-02 10:00:00+08',
 'offboarded',
 TIMESTAMPTZ '2026-03-04 09:00:00+08',
 TIMESTAMPTZ '2026-04-25 17:00:00+08',
 'resigned_by_student',
 '下学期要去实习，无法继续到岗，已和老师当面沟通过。',
 TIMESTAMPTZ '2026-02-28 14:00:00+08', TIMESTAMPTZ '2026-04-25 17:00:00+08')
ON CONFLICT (id) DO NOTHING;
