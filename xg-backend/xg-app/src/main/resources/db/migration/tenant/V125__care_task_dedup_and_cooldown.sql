-- 主动关怀 W2.3b：去重与冷却
-- 见《主动关怀任务去重与冷却落地方案.md》§4.1。
-- 核心：同一 (student, rule) 未关闭时 DB 层只允许 1 条，关闭后按 cooldown_until 抑制重开。

ALTER TABLE care_task
    ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trigger_count     INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cooldown_until    TIMESTAMPTZ;

COMMENT ON COLUMN care_task.last_triggered_at IS '最近一次规则再次命中时间（merge 时刷新）';
COMMENT ON COLUMN care_task.trigger_count IS '同一规则累计命中次数；merge 累加，新建为 1';
COMMENT ON COLUMN care_task.cooldown_until IS '关闭时物化 = closed_at + rule.cooldown_days；此前再命中被抑制';

-- 关键约束：未关闭状态下 (tenant, student, rule) 唯一。
-- 即便定时扫描与未来事件触发并发撞车，DB 也只会留 1 条 open 任务。
-- 这条索引同时堵掉"任务长期未关闭、冷却窗口滑过后又被建第二条"的漏洞。
CREATE UNIQUE INDEX IF NOT EXISTS uq_care_task_open_student_rule
    ON care_task(tenant_id, student_id, rule_id)
    WHERE status IN ('pending', 'accepted', 'in_progress', 'overdue');

-- 查"最近一次关闭任务"判断是否仍在冷却期。
CREATE INDEX IF NOT EXISTS idx_care_task_rule_closed
    ON care_task(tenant_id, student_id, rule_id, closed_at DESC);
