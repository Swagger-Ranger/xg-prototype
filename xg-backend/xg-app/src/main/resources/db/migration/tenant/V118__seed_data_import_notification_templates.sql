-- 数据导入完成 / 失败通知模板 — 补通知铁律:
-- DataImportService.execute 完成后必须经 NotificationOrchestrator 通知操作人,
-- 不允许业务侧直接调 NotificationService.send。
--
-- recipients=[{"type":"applicant"}] 走 ApplicantResolver:caller 在 RecipientContext.applicant()
-- 里塞触发导入的操作人 user_id;Orchestrator + applicant slot 复用,跟 workstudy 一致。
--
-- 渠道选择:导入是后台批处理,完成后操作人不一定还在页面上,所以默认 3 渠道扇出,
-- 让操作人在小程序 / 企业微信 也能看到结果。管理员可在通知中心改文案 / 渠道 / 静默。

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module,
     title_tmpl, body_tmpl, default_channels, default_level, recipients, description)
VALUES
    -- 1. 导入成功:展示 scenario + 文件名 + 成功 / 跳过 / 失败行数
    (8970, '${tenant_id}', 'DATA_IMPORT_COMPLETED', 'business', 'data_import',
     '数据导入完成:{{scenario_label}}',
     '文件「{{file_name}}」导入完成 — 新建 {{created}}、更新 {{updated}}、跳过 {{skipped}}、失败 {{failed}}。{{failed_clause}}',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '数据导入执行成功,通知操作人(applicant slot=importerId)'),

    -- 2. 导入失败:整体执行抛异常 / 校验阻挡的场景,error_message 透传
    (8971, '${tenant_id}', 'DATA_IMPORT_FAILED', 'business', 'data_import',
     '数据导入失败:{{scenario_label}}',
     '文件「{{file_name}}」导入失败:{{error_message}}。请检查后重新提交。',
     '{in_app, miniprogram, wecom}', 'high',
     '[{"type":"applicant"}]'::jsonb,
     '数据导入执行失败,通知操作人(applicant slot=importerId)')
ON CONFLICT (tenant_id, code) DO NOTHING;
