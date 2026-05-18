-- 主动关怀 W5：下钻异常审计摘要模板（PRD §13.2 / 项目开发约定 §2 通知铁律）。
-- 每周一 09:00 向学工部部长推送"本周下钻异常"摘要——不推全量日志、不含学生明细。
--
-- recipients=[{"type":"applicant"}]：学工部部长由 scheduler 解析其 user_id 后
-- 经 RecipientContext.applicant(directorId) 传入（复用 V127 / V112 同款 idiom，
-- 因通知框架无"按角色广播"recipient type，多个部长则逐个 send）。
--
-- 渠道 in_app + wecom（领导审计提醒需即时触达）；level normal。

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module,
     title_tmpl, body_tmpl, default_channels, default_level, recipients, description)
VALUES
    (8984, '${tenant_id}', 'care_task_drill_anomaly', 'business', 'care',
     '下钻访问异常审计摘要',
     '近一周检测到 {{n}} 项下钻访问异常，请登录主动关怀审计查看。本通知不含明细。',
     '{in_app, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '下钻异常周报（学工部部长；scheduler 解析角色后用 applicant slot 推送）')
ON CONFLICT (tenant_id, code) DO NOTHING;
