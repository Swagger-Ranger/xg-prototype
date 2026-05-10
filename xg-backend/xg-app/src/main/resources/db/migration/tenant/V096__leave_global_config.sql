-- 全局请假策略表（租户级单行）。
--
-- 起因:per-假别 term_max_days 改成全局学期累计上限——只要这个学生本学期所有
-- 假别累计超过设定天数,无论是哪种假别都视作高风险。学生申请页和辅导员审批
-- 页都会显示软警告(不阻断提交),PendingTaskEnricher 把它纳入 high 评分。
--
-- 单行约束:tenant_id 主键即可,每租户最多一条记录;按 ON CONFLICT 升级。
-- term_max_days NULL = 不限。后续单次最大天数 / 连续请假冷却期等全局策略
-- 也往这张表加列,不再到处散点配置。
CREATE TABLE IF NOT EXISTS leave_global_config (
    tenant_id     VARCHAR(32)    NOT NULL,
    term_max_days NUMERIC(5,1),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_by    BIGINT,
    PRIMARY KEY (tenant_id)
);

COMMENT ON TABLE leave_global_config IS '租户级全局请假策略(单行)';
COMMENT ON COLUMN leave_global_config.term_max_days IS
    '本学期所有假别累计请假上限(天数,可半天)。NULL=不限;超过仅做软警告 + 高风险标记。';
