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

-- ============================================================================
-- 数据修复：建唯一索引前，确保 (biz_type, COALESCE(college_id, -1)) 桶下
-- 至多一条 status='published'。
--
-- 历史遗留：
--   V029 插入 leave_v2 (id=1001, status=published)，V031 把它的 biz_type 设为 'leave'。
--   V050 插入 leave_v3 v7 (id=1006, status=published)，但 UPDATE demote 子句只匹配
--        code='leave_v3'，漏掉了 code='leave_v2'，导致 biz_type='leave' 同时有
--        两条 published —— 与下面要建的唯一索引冲突。
--
-- 策略：对每个 (biz_type, COALESCE(college_id, -1)) 组合，保留 version 最大
--      （version 相同则 id 大）的那条 published 行，其余 demote 为 disabled。
--      biz_type IS NULL 的不处理（部分唯一索引下 NULL 默认互不相等）。
--      运行中的 workflow_instance 走的是 definition_snapshot，不受这次 demote 影响。
-- ============================================================================
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY biz_type, COALESCE(college_id, -1)
               ORDER BY version DESC, id DESC
           ) AS rn
      FROM workflow_definition
     WHERE status = 'published'
       AND biz_type IS NOT NULL
)
UPDATE workflow_definition wd
   SET status = 'disabled',
       updated_at = NOW()
  FROM ranked r
 WHERE wd.id = r.id
   AND r.rn > 1;

-- 唯一性放宽：同 (biz_type, college_id) 最多一条 published。
-- 用 partial unique index 表达（college_id IS NULL 时也算同一桶）。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_definition_published_per_scope
    ON workflow_definition (biz_type, COALESCE(college_id, -1))
    WHERE status = 'published';

COMMENT ON COLUMN workflow_definition.college_id IS
    '学院级 override 用：NULL=全校默认，其它=仅该 college_id 的学生用此版本（A.1 多 YAML 同 bizType 模型）';
