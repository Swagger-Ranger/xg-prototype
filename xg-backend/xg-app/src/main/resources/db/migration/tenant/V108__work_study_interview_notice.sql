-- B2 面试通知 + AI 起草
-- 设计要点（朝夕 vs 金智）：
--   1. 不做模板库 / 风格选择 / 多渠道勾选 / 学生回执流程 — AI 一键生成 + 用户可编辑 + Orchestrator 默认渠道
--   2. body_tmpl 是 {{body}} 占位符 — 由发起人 / AI 写的最终文案直接透传
--   3. 收件人固定 applicant（学生本人），Orchestrator 走偏好路由三渠道

ALTER TABLE work_study_application
    ADD COLUMN interview_at           TIMESTAMPTZ,
    ADD COLUMN interview_location     VARCHAR(200),
    ADD COLUMN interview_notes        TEXT,
    ADD COLUMN interview_notified_at  TIMESTAMPTZ;

COMMENT ON COLUMN work_study_application.interview_at          IS '面试时间';
COMMENT ON COLUMN work_study_application.interview_location    IS '面试地点';
COMMENT ON COLUMN work_study_application.interview_notes       IS '面试备注（employer 端内部记录，与通知正文区分）';
COMMENT ON COLUMN work_study_application.interview_notified_at IS '最近一次面试通知发出时间（重复发送会覆盖）';

INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module,
     title_tmpl, body_tmpl, default_channels, default_level, recipients, description)
VALUES
    (8960, '${tenant_id}', 'INTERVIEW_INVITE', 'business', 'workstudy',
     '面试通知 — {{position_title}}',
     '{{body}}',
     '{in_app, miniprogram, wecom}', 'normal',
     '[{"type":"applicant"}]'::jsonb,
     '勤工助学面试邀请；body 由 employer/AI 撰写后透传')
ON CONFLICT (tenant_id, code) DO NOTHING;
