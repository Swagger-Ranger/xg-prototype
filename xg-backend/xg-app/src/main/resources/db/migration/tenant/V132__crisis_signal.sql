-- 危机求助快速通道 v1 —— crisis_signal 落库表（脚手架，默认关闭）。
-- 设计见 `危机求助快速通道-设计方案.md` §4.2 / PRD §9.5（并行 P1 例外，不进 care 规则引擎）。
-- 重要：本通道默认关闭（feature flag xg.crisis.enabled=false）；D1/D2/D3 未拍板前不激活。
-- 隐私铁律：本表不存学生原话，只存稳定 message_id + 命中词表版本（设计 §5）。

CREATE TABLE IF NOT EXISTS crisis_signal (
    id                 BIGINT      PRIMARY KEY,           -- 应用层 ASSIGN_ID
    tenant_id          VARCHAR(32) NOT NULL,
    student_id         BIGINT      NOT NULL,              -- 受害学生；由 Java 重校验已认证 token 解析（设计 §4.1）
    message_id         VARCHAR(64) NOT NULL,              -- xg-ai 每条入站消息生成的稳定 id；不要求消息持久化
    rule_version       VARCHAR(32) NOT NULL,              -- 命中时词表版本，复核/回溯用；不存原文
    status             VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / closed（v1 只这两态）
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_notified_at  TIMESTAMPTZ,                       -- 首次通知成功时间；null=尚未成功通知
    notify_status      VARCHAR(16),                       -- sent / failed；null=未发
    handled_at         TIMESTAMPTZ,                       -- 人工关闭时间
    handled_by         BIGINT                             -- 关闭人（已认证身份，非传参）
);

-- 幂等键：同一 (tenant, message, 词表版本) 重复回调只复用同一行（设计 §4.1）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_crisis_signal_idem
    ON crisis_signal (tenant_id, message_id, rule_version);

CREATE INDEX IF NOT EXISTS idx_crisis_signal_pending
    ON crisis_signal (tenant_id, status) WHERE status = 'pending';

COMMENT ON TABLE crisis_signal IS '危机求助快速通道线索（P1 例外，并行通道，不进 care 规则引擎）；默认关闭，不存原话';
COMMENT ON COLUMN crisis_signal.message_id IS 'xg-ai 生成的稳定消息 id；幂等键之一；不要求该消息被持久化';
COMMENT ON COLUMN crisis_signal.first_notified_at IS '首次通知成功时间；用于 send 返回 null 的歧义消解（设计 §4.3：null 一律按失败，除非此处已置）';
COMMENT ON COLUMN crisis_signal.status IS 'pending / closed；超出二态属 backlog（ack 状态机）';
