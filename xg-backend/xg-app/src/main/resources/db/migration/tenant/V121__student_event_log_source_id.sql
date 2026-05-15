-- 主动关怀工作台 W2.1：给 student_event_log 加 source_id
-- 用途：回溯到来源业务记录（leave_request.id / work_study_application.id 等），
--      让规则引擎能从事件 → 原始单据，让审计能从任务 → 触发证据 → 业务详情。
-- PRD §8.3（v1.3 final）schema 要求 source_id BIGINT NULL。

ALTER TABLE student_event_log
    ADD COLUMN IF NOT EXISTS source_id BIGINT;

COMMENT ON COLUMN student_event_log.source_id IS
    '来源业务记录 ID（如 leave_request.id、work_study_application.id）；可空，旧事件回填留 NULL';

-- 不建独立索引：source_id 检索通常和 event_type / tenant_id 共用，
-- 现有 idx_event_type / idx_event_tenant_student 已足够，避免索引膨胀。
