-- 主动关怀工作台 W2.1：核心业务对象 care_task
-- 见 PRD §10.1 / docs/W1-信息架构与任务卡.md §5。
-- 状态机由 Java service 守门（CareTaskTransitions 常量表），库表不加 CHECK 以便后续扩展。

CREATE TABLE IF NOT EXISTS care_task (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    student_id          BIGINT NOT NULL,

    -- 规则归属：rule_id 是产品方维护的内置规则代号（R001-R012），rule_version 标识规则集版本
    rule_id             VARCHAR(16) NOT NULL,
    rule_version        VARCHAR(32) NOT NULL,
    severity            VARCHAR(16) NOT NULL,         -- critical / high / medium / low

    -- 触发证据快照：规则命中时的事件 ID 列表 + 摘要值，独立于 student_event_log 以防事件归档后丢证据
    trigger_data        JSONB NOT NULL,

    -- 指向 task_ai_brief_history 中最新可用版本；为空表示尚未生成
    current_brief_id    BIGINT,

    -- 状态机：pending / accepted / in_progress / resolved / rejected / transferred / overdue
    status              VARCHAR(16) NOT NULL DEFAULT 'pending',
    assigned_to         BIGINT NOT NULL,              -- 责任辅导员（由 OrgAssignment 决定）

    due_at              TIMESTAMPTZ NOT NULL,         -- SLA 截止
    accepted_at         TIMESTAMPTZ,
    accepted_by         BIGINT,

    reschedule_count    INT NOT NULL DEFAULT 0,

    closed_at           TIMESTAMPTZ,
    closed_by           BIGINT,
    closed_reason       VARCHAR(32),                  -- resolved / rejection reason_code / transfer
    transferred_to      VARCHAR(32),                  -- 转介目标部门：counseling_center / aid_office / academic_affairs / security

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 工作台首页查询模式：assigned_to + status + severity 排序 + due_at
CREATE INDEX IF NOT EXISTS idx_care_task_assignee_status
    ON care_task(tenant_id, assigned_to, status, due_at);

-- 院系汇总查询模式
CREATE INDEX IF NOT EXISTS idx_care_task_tenant_status
    ON care_task(tenant_id, status, created_at DESC);

-- 学生侧只读查询（小程序"我的关怀记录"）
CREATE INDEX IF NOT EXISTS idx_care_task_student
    ON care_task(tenant_id, student_id, created_at DESC);

-- 超期扫描定时任务：只看未关闭且 due_at < now()
CREATE INDEX IF NOT EXISTS idx_care_task_overdue_scan
    ON care_task(tenant_id, due_at)
    WHERE status IN ('pending', 'accepted', 'in_progress');

-- 院系"需要介入"视图：reschedule_count >= 2 自动入选
CREATE INDEX IF NOT EXISTS idx_care_task_escalation
    ON care_task(tenant_id, reschedule_count, status)
    WHERE reschedule_count >= 2 AND status NOT IN ('resolved', 'rejected', 'transferred');

COMMENT ON TABLE care_task IS '主动关怀任务（替代旧 student_alert，W4 起两套并行 1 个月）';
COMMENT ON COLUMN care_task.rule_id IS '内置规则代号 R001-R012，产品方维护';
COMMENT ON COLUMN care_task.rule_version IS '规则集版本，用于规则升级后追溯老任务的命中逻辑';
COMMENT ON COLUMN care_task.trigger_data IS '触发证据快照（事件 ID + 摘要值），独立于 student_event_log';
COMMENT ON COLUMN care_task.current_brief_id IS '指向 task_ai_brief_history 最新可用 brief；NULL 表示未生成';
COMMENT ON COLUMN care_task.status IS 'pending/accepted/in_progress/resolved/rejected/transferred/overdue（终态：resolved/rejected/transferred）';
COMMENT ON COLUMN care_task.reschedule_count IS '改期次数；>=2 进入院系"需要介入"视图但不改 status';
