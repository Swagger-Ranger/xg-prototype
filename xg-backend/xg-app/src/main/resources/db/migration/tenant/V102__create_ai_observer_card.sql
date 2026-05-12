-- AI 观察员卡片(院长 / 学工部部长自己用自然语言配置出来的卡)。
-- 一张卡 = 一段 NL 描述 + 一条 sql_text(QueryGuard 校验/改写后的)+ 一种 chart_type。
-- workspace 渲染时按 (owner_id, sort_order) 取本人的所有卡,每张过 QueryGuardService.safeExecute。

CREATE TABLE IF NOT EXISTS ai_observer_card (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    -- 谁的卡(本人可见,他人不可见;dean 只能看本院数据由 QueryGuard.role_scope 强制注入)
    owner_id        BIGINT NOT NULL,
    owner_role      VARCHAR(32) NOT NULL,
    -- 用户填的标题,workspace 卡片头部显示
    title           VARCHAR(80) NOT NULL,
    -- 最近一次 NL 描述,「编辑」时塞回输入框
    nl_query        TEXT NOT NULL,
    -- LLM 出的 SQL(未经 QueryGuard 改写的原始模板);执行前再过一次校验+注入
    sql_text        TEXT NOT NULL,
    -- 可视化:statistic | bar | line | pie | table | trend
    chart_type      VARCHAR(20) NOT NULL,
    -- echarts options(x/y 列名、堆叠、配色等),前端按 chart_type 解释
    chart_opts      JSONB DEFAULT '{}',
    -- 缓存秒数,workspace useQuery 的 staleTime
    refresh_sec     INT NOT NULL DEFAULT 300,
    -- 保存时 EXPLAIN 出来的 cost / rows,workspace 显示「查询较重」warning 用
    cost_estimate   BIGINT,
    rows_estimate   BIGINT,
    sort_order      INT NOT NULL DEFAULT 0,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_observer_card_owner
    ON ai_observer_card(tenant_id, owner_id, sort_order)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE ai_observer_card IS 'AI 观察员卡片(管理员 NL 配置出来的可视化卡)';
COMMENT ON COLUMN ai_observer_card.sql_text IS 'LLM 出的原始 SQL,每次执行前过 QueryGuardService 校验+role_scope 注入';
COMMENT ON COLUMN ai_observer_card.chart_type IS 'statistic / bar / line / pie / table / trend';
