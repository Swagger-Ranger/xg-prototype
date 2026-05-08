-- 关怀通知模板 — 5 条对应 LeaveReminderService 的 4 个时机 + 1 个抄送
--
-- 复用现有 LeaveReminderService 的扫描 + reminder_sent_mask 防重逻辑,
-- 只把硬编码文案 / 渠道改走 Orchestrator + 模板。管理员现在可以:
--   * 在通知中心改文案(title_tmpl / body_tmpl)
--   * 按角色配偏好(notification_preference)切换 in_app / wecom / miniprogram
--
-- V089 里 seed 的 3 条 CARE_xxx + 3 条 care_rule 留作 P1 真做"DB 规则驱动关怀"
-- 时启用 — 它们 enabled=true 但因为没人调 LeaveCareDispatcher(已删),不会发出。
-- 可以临时禁用,但 P1 复用方便,先留着。

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module, title_tmpl, body_tmpl, default_channels, default_level, description)
VALUES
    (8931, '${tenant_id}', 'REMINDER_LEAVE_START', 'care', 'leave',
     '假期即将开始',
     '您的{{leave_type_name}}({{range}},共 {{days}} 天)将在约 {{hours_left}} 小时后开始。{{caring}}{{weather_seg}}',
     '{in_app, miniprogram}', 'normal',
     '请假开始前 2 小时,推送行程提醒 + 假别关怀语 + 可选目的地天气'),

    (8932, '${tenant_id}', 'REMINDER_PRE_END', 'care', 'leave',
     '假期即将结束',
     '您的{{leave_type_name}}将在约 {{hours_left}} 小时后结束({{end_dt}}),请合理安排返校时间,到期后记得提交销假。',
     '{in_app, miniprogram}', 'normal',
     '请假结束前 2 小时,提醒返校 + 销假'),

    (8933, '${tenant_id}', 'REMINDER_DUE', 'care', 'leave',
     '请假已到期,请尽快销假',
     '您 {{range}} 的{{leave_type_name}}已到期。请尽快提交销假,以便确认安全到校。',
     '{in_app, miniprogram}', 'important',
     '请假到期后 0-2 小时内,软提醒销假'),

    (8934, '${tenant_id}', 'REMINDER_OVERDUE', 'care', 'leave',
     '请假超时未销假',
     '您的{{leave_type_name}}已超过结束时间 {{hours_over}} 小时仍未销假。请立即提交销假,并联系辅导员说明情况。',
     '{in_app, miniprogram, wecom}', 'urgent',
     '请假超时 2+ 小时,紧急提醒学生'),

    (8935, '${tenant_id}', 'REMINDER_OVERDUE_COUNSELOR', 'care', 'leave',
     '学生请假超时未销假',
     '{{student_name}} 的{{leave_type_name}}({{range}})已超时 {{hours_over}} 小时未销假,请关注并跟进处理。',
     '{in_app, wecom}', 'important',
     '学生请假超时,抄送其辅导员')
ON CONFLICT (tenant_id, code) DO NOTHING;
