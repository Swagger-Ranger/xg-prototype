-- 主动关怀 W6：规则运维持久化（PRD §6.3 / §15.4）。
-- P1 学校侧只能"启停单条规则"和"全局严重度偏移 -1/0/+1"，不能改阈值 / DSL。
-- 规则定义本体仍是产品方维护的代码（CareRuleCatalog，不入库）；本两表只存"租户对内置规则的运维覆盖"。

-- 单条规则启停覆盖。只为"被显式停用/重启过"的规则建行；无行 = 默认启用（catalog 默认态）。
CREATE TABLE IF NOT EXISTS care_rule_config (
    tenant_id   VARCHAR(32) NOT NULL,
    rule_id     VARCHAR(16) NOT NULL,          -- 对应 CareRuleCatalog 的 R001-R012
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by  BIGINT,                        -- 操作的规则管理员 user id
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, rule_id)
);

COMMENT ON TABLE care_rule_config IS '租户对内置规则的启停覆盖；无行=默认启用';
COMMENT ON COLUMN care_rule_config.rule_id IS '内置规则代号；非 catalog 内的 rule_id 由 service 层挡掉';
COMMENT ON COLUMN care_rule_config.enabled IS 'false=该租户停用此规则，CareScanService 扫描时跳过';

-- 全局严重度偏移。每租户一行（单例），施加到 *所有* 规则派生 severity（PRD §6.3）。
-- offset ∈ {-1,0,1}：在 low<medium<high<critical 序上整体移位并钳位；同步影响 SLA。
CREATE TABLE IF NOT EXISTS care_rule_setting (
    tenant_id        VARCHAR(32) PRIMARY KEY,
    severity_offset  SMALLINT    NOT NULL DEFAULT 0 CHECK (severity_offset BETWEEN -1 AND 1),
    updated_by       BIGINT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE care_rule_setting IS '租户级全局严重度偏移（单行）；无行=偏移 0';
COMMENT ON COLUMN care_rule_setting.severity_offset IS '-1/0/+1，整体移位规则派生 severity 并钳位，同步影响 SLA';
