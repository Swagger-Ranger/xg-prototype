-- A.1：workflow_definition 加 college_id 列，支持"按学院 override"的多份
-- YAML 路由。NULL = 全校默认；非 NULL = 仅该学院学生用。
--
-- 解析规则（在 WorkflowEngine 里实现）：
--   1) 先找 (biz_type, college_id = student.college_id, status='published', max version)
--   2) 没有则回落 (biz_type, college_id IS NULL, status='published', max version)
-- 这样不打破既有定义的行为：现存 leave_v3 / leave_return_v1 等 college_id
-- 都是 NULL，照旧匹配。

ALTER TABLE workflow_definition
    ADD COLUMN IF NOT EXISTS college_id BIGINT NULL;

-- 唯一性放宽：同 (biz_type, college_id) 最多一条 published。
-- 用 partial unique index 表达（college_id IS NULL 时也算同一桶）。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_definition_published_per_scope
    ON workflow_definition (biz_type, COALESCE(college_id, -1))
    WHERE status = 'published';

COMMENT ON COLUMN workflow_definition.college_id IS
    '学院级 override 用：NULL=全校默认，其它=仅该 college_id 的学生用此版本（A.1 多 YAML 同 bizType 模型）';
