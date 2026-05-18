-- 勤工助学通知模板 seed — 补齐 4 个 workstudy 专属模板,
-- 把硬编码 NotificationService.send 调用迁到 Orchestrator + 模板路由。
--
-- 已复用的通用模板(无需新建):
--   WORKFLOW_APPROVED / WORKFLOW_REJECTED  → 岗位 / 应聘 / 薪资驳回 决策通知
--   INTERVIEW_INVITE (V108=8960)           → 面试通知
--
-- 新增 4 个 workstudy 专属模板,均走默认 3 渠道,管理员可在通知中心改文案 / 渠道 / 静默:

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module,
     title_tmpl, body_tmpl, default_channels, default_level, recipients, description)
VALUES
    -- 1. 薪资申报通知:用人单位提交薪资单后,通知学生本人"用人单位帮你申报了"
    (8961, '${tenant_id}', 'WORKSTUDY_SALARY_SUBMITTED', 'business', 'workstudy',
     '勤工薪资已申报',
     '用人单位为你申报了 {{month}} 在「{{position_title}}」岗位的薪资 ¥{{amount}},资助中心审核中。',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '勤工薪资单提交,通知学生'),

    -- 2. 薪资确认通知:工作流终态 approved 时,通知学生(钱是学生的)
    --    朝夕方案 B:不引入 paid 状态,但文案明确"确认 ≠ 已到账",给学生时间预期
    (8962, '${tenant_id}', 'WORKSTUDY_SALARY_CONFIRMED', 'business', 'workstudy',
     '勤工薪资已确认',
     '您 {{month}} 的勤工薪资 ¥{{amount}} 已审核通过,通常 1-2 周内到账校园卡。若超期未到请咨询资助中心。',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '勤工薪资审核通过,通知学生(salary-approved 特例,不复用 WORKFLOW_APPROVED 因为需要"到账提示")'),

    -- 3. 离岗通知(给学生):employer 端发起离岗 / 任期满,通知学生
    (8963, '${tenant_id}', 'WORKSTUDY_OFFBOARD_TO_STUDENT', 'business', 'workstudy',
     '勤工助学:已离岗',
     '您在「{{position_title}}」岗位的工作已结束({{reason_label}}){{note_clause}}',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '学生离岗通知(employer 端发起 / 任期满)'),

    -- 4. 离岗通知(给用人单位):学生主动离岗,通知岗位负责人
    --    recipient=applicant slot 复用,caller 在 RecipientContext.applicant() 里填岗位负责人 user_id
    (8964, '${tenant_id}', 'WORKSTUDY_OFFBOARD_TO_EMPLOYER', 'business', 'workstudy',
     '勤工助学:学生已离岗',
     '{{student_name}} 已主动从「{{position_title}}」岗位离岗。{{note_clause}}',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '学生主动离岗,通知岗位负责人(用 applicant slot 传 owner_user_id)')
ON CONFLICT (tenant_id, code) DO NOTHING;
