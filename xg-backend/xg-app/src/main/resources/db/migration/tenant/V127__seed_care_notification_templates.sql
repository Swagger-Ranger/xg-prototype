-- 主动关怀工作台通知模板 seed（PRD §12.2 / 项目开发约定 §2 通知铁律）。
-- 业务侧只调 NotificationOrchestrator.send(code, 'care_task', task.id, ctx, vars)，
-- 文案 / 渠道 / 静默均由本表落库，管理员可在通知中心 UI 改，不动代码。
--
-- recipients=[{"type":"applicant"}]：责任辅导员通过 applicant slot 传入
-- （RecipientContext.applicant(care_task.assigned_to)，复用 V112 同款 idiom）。
--
-- 渠道按 §12.3：critical 仅 in_app（站内，不自动外发企微）；high / digest
-- in_app + wecom；low 不单独发（站内待办即任务本身，§12.2 无 low 模板）。
-- 文案按 §12.2：不含学生姓名 / 规则名 / 判断词。

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module,
     title_tmpl, body_tmpl, default_channels, default_level, recipients, description)
VALUES
    (8980, '${tenant_id}', 'care_task_high_immediate', 'business', 'care',
     '您有 1 项主动关怀任务',
     '您有 1 项需在 48 小时内跟进的主动关怀任务，请登录主动关怀工作台查看。',
     '{in_app, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     'high 任务即时提醒（责任辅导员，企微即时 + 站内）'),

    (8981, '${tenant_id}', 'care_task_daily_digest', 'business', 'care',
     '今日主动关怀清单',
     '您今日有 {{n}} 项主动关怀任务，请登录主动关怀工作台查看。',
     '{in_app, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     'medium 每日 09:00 聚合（责任辅导员，只写数量和入口）'),

    (8982, '${tenant_id}', 'care_task_critical_dashboard', 'business', 'care',
     '紧急关怀线索待研判',
     '{{college_name}} 当前有 {{n}} 项紧急关怀线索，请值守人员登录看板查看。',
     '{in_app}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     'critical 看板提示（站内，不自动外发企微 §12.3）'),

    (8983, '${tenant_id}', 'care_task_urge', 'business', 'care',
     '您有 1 项主动关怀任务待处理',
     '该任务已进入督办，请尽快登录主动关怀工作台处理。',
     '{in_app, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '领导督办（责任辅导员；send 在 W5 督办端点接入，模板先落库满足铁律）')
ON CONFLICT (tenant_id, code) DO NOTHING;
