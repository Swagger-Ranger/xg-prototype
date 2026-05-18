-- 危机线索查看/关闭审计 —— append-only（设计 `危机求助快速通道-设计方案.md` §5）。
-- 为什么单独一张表而不混进 care_task_audit：危机详情的访问留痕要求比普通关怀更严
-- （谁在何时看了「某学生求助」这种最敏感信息都必须可追溯），且 crisis 与 care 规则
-- 引擎并行、不共状态机，审计语义也独立（view / close 两个动作，无状态迁移）。

CREATE TABLE IF NOT EXISTS crisis_signal_audit (
    id          BIGINT      PRIMARY KEY,            -- 应用层 ASSIGN_ID
    tenant_id   VARCHAR(32) NOT NULL,
    signal_id   BIGINT      NOT NULL,               -- 指向 crisis_signal.id
    action      VARCHAR(16) NOT NULL,               -- view / close
    actor_id    BIGINT,                             -- 已认证查看/处理人（非传参）
    actor_role  VARCHAR(32),                        -- 留痕用的最高权限角色 code
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crisis_signal_audit_signal
    ON crisis_signal_audit (tenant_id, signal_id, created_at);

COMMENT ON TABLE crisis_signal_audit IS '危机线索查看/关闭审计（append-only，设计 §5：危机详情访问留痕，比普通关怀更严）';
COMMENT ON COLUMN crisis_signal_audit.action IS 'view=辅导员打开危机详情；close=人工核实后关闭';
