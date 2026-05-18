-- 危机通道 v1 —— must_deliver 列 + 危机通知模板 seed（脚手架，默认关闭）。
-- 设计见 `危机求助快速通道-设计方案.md` §4.3。

-- must_deliver：标了它的模板"不可静默"。Orchestrator 对 muted 偏好仍强制保留 in_app
-- （实现见 NotificationOrchestrator.resolveChannels）。停用保护取"后台禁止停用"（admin 侧），
-- 故此处只加列，不改 enabled 语义。只作用于标了它的模板，不改全局通知行为。
ALTER TABLE notification_template
    ADD COLUMN IF NOT EXISTS must_deliver BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN notification_template.must_deliver IS '不可静默：muted 偏好也强制保留 in_app；只影响标了它的模板（设计 §4.3）';

-- 危机通知模板 seed。文案是 D5 未定前的占位草稿（设计 §4.3）：
--   零诊断词是硬约束（不写自杀/心理危机/抑郁）；是否含姓名/班级由 D5 定，未定前不放可识别信息。
-- 收件人：v1 = 责任辅导员（applicant_counselor，applicant 即受害学生）。
--   危机值班（static_user）由 D3 拍板后追加，例如 [{"type":"applicant_counselor"},{"type":"static_user","user_id":<D3>}]
--   —— 工程不臆造 user_id，故 seed 暂只含 applicant_counselor。
INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module, title_tmpl, body_tmpl,
     default_channels, default_level, enabled, must_deliver, recipients, description)
VALUES
    (990101, '${tenant_id}', 'CRISIS_SIGNAL_IMMEDIATE', 'business', 'crisis',
     '有学生需要尽快人工关心',
     '一名你负责的学生主动表达需要帮助，请尽快当面/电话核实（详情见受控页）。',
     '{in_app,wecom}', 'urgent', TRUE, TRUE,
     '[{"type":"applicant_counselor"}]'::jsonb,
     '危机求助快速通道首次通知（P1 例外，默认关闭，文案 D5 未定前为占位）')
ON CONFLICT (tenant_id, code) DO NOTHING;
