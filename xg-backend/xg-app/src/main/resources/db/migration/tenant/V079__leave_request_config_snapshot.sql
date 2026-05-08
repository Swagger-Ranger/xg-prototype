-- 请销假配置管理 P0：给 leave_request 加 config_snapshot 列。
-- 对应设计文档 v0.5 §1.6（学生提交快照——解决"审批中途配置改动"问题）。
--
-- 提交时合并器跑一次输出 EffectiveConfig，存到 leave_request.config_snapshot。
-- 后续审批节点解析、SLA 计算、通知发送都基于 config_snapshot，不再读 base/patch。
-- （workflow 路由实际接入留待 §7.1.2-B；本迁移只建数据通道。）
--
-- 默认 '{}'::jsonb 是为了让 V075 之前已存在的历史申请行也有合法值——它们的审批
-- 早已结束，snapshot 用空对象兜底即可，不影响业务。

ALTER TABLE leave_request
    ADD COLUMN IF NOT EXISTS config_snapshot    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS config_snapshot_at TIMESTAMPTZ;

COMMENT ON COLUMN leave_request.config_snapshot IS '提交时合并 base+patches 后的 EffectiveConfig（含 leaveTypes/notifications/compiledChain），审批生命周期内只读此快照';
COMMENT ON COLUMN leave_request.config_snapshot_at IS '快照生成时间（提交时刻）';
