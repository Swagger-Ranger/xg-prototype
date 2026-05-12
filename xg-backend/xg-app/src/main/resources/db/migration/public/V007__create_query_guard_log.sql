-- QueryGuard 慢查询 / 拦截日志。
-- NL→SQL 入口(学生信息库 / AI 观察员)的每次执行,如果 cost > 阈值 / actualMs > 500
-- 就异步落一行,便于运营盘点哪些卡 / 哪些用户烧资源。
-- 一并记录被 reject 的查询,用 reject_code 区分。
CREATE TABLE IF NOT EXISTS query_guard_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    owner_id        BIGINT,
    owner_role      VARCHAR(32),
    -- 调用方:'field_catalog' / 'ai_observer_preview' / 'ai_observer_card' 等
    source          VARCHAR(32) NOT NULL,
    -- reject_code = NULL 表示成功执行;非 NULL 表示 QueryGuard 拒绝的原因(QueryGuardException.Code 枚举名)
    reject_code     VARCHAR(64),
    sql_hash        VARCHAR(64) NOT NULL,    -- sha256(rewritten_sql + params),用于聚合
    sql_text        TEXT,                    -- 最多存 1KB,长查询截断;调试用
    plan_cost       BIGINT,
    plan_rows       BIGINT,
    actual_ms       INT,
    row_count       INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qg_log_tenant_time
    ON query_guard_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qg_log_owner_time
    ON query_guard_log(tenant_id, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qg_log_reject
    ON query_guard_log(tenant_id, reject_code, created_at DESC)
    WHERE reject_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qg_log_hash
    ON query_guard_log(sql_hash);

COMMENT ON TABLE query_guard_log IS 'QueryGuard 执行日志:慢查询 + 被拒查询,运营盘点用';
COMMENT ON COLUMN query_guard_log.reject_code IS 'NULL=成功;非 NULL=QueryGuardException.Code 枚举名';
COMMENT ON COLUMN query_guard_log.sql_hash IS 'sha256(rewritten_sql || params)前 64 字符,聚合同类查询用';
