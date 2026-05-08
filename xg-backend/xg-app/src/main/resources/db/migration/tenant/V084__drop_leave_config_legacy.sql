-- A.1 Phase D:删除遗留的 leave_config_* 表 + leave_request.config_snapshot 列。
-- 工作流执行已经完全切换到 workflow_definition.config_yaml(v9 over A.1 college 路由)
-- LeaveService 不再读 config_snapshot;LeaveConfigBaseMapper / Service 等已删。
--
-- 数据同步:把 leave_config_base.config.leaveTypes JSONB 中的 6 假别同步进
-- leave_type_config 表(供 LeaveConfigBaseService 简化版读取)。表本来有
-- 5 行老假别(sick_on_campus / weekend / 等),先全软删再按新结构插入,保持
-- code 一致性。

-- 1) 同步:把当前 published config.leaveTypes 写到 leave_type_config 表。
-- ON CONFLICT 走 (tenant_id, code) 唯一约束 —— 同 code 已存在则更新字段,
-- 不存在则用 1000+sort 作为新 id。
WITH base_types AS (
  SELECT t->>'code'    AS code,
         t->>'name'    AS name,
         (t->>'maxDays')::int AS max_days,
         t->'proof'->>'required' = 'required' AS require_attachment,
         COALESCE((t->>'enabled')::boolean, true) AS enabled,
         row_number() OVER () AS sort_order
    FROM leave_config_base, jsonb_array_elements(config->'leaveTypes') AS t
   WHERE leave_config_base.status = 'published'
)
INSERT INTO leave_type_config
    (id, tenant_id, code, name, max_days, require_attachment, enabled, sort_order, extra_fields, created_at)
SELECT (1000 + bt.sort_order) AS id,
       '${tenant_id}'         AS tenant_id,
       bt.code, bt.name, bt.max_days, bt.require_attachment, bt.enabled, bt.sort_order,
       '[]'::jsonb            AS extra_fields,
       NOW()
  FROM base_types bt
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name               = EXCLUDED.name,
       max_days           = EXCLUDED.max_days,
       require_attachment = EXCLUDED.require_attachment,
       enabled            = EXCLUDED.enabled,
       sort_order         = EXCLUDED.sort_order,
       deleted_at         = NULL,                  -- 复活之前可能被软删的同名 row
       updated_at         = NOW();

-- 把不在 base_types 里的老 leave_type_config 软删
UPDATE leave_type_config
   SET deleted_at = NOW()
 WHERE deleted_at IS NULL
   AND code NOT IN (SELECT t->>'code'
                      FROM leave_config_base, jsonb_array_elements(config->'leaveTypes') AS t
                     WHERE status = 'published');

-- 2) 删 leave_request.config_snapshot 列
ALTER TABLE leave_request DROP COLUMN IF EXISTS config_snapshot;
ALTER TABLE leave_request DROP COLUMN IF EXISTS config_snapshot_at;

-- 3) 删 3 张 leave_config_* 表
DROP TABLE IF EXISTS leave_config_changelog CASCADE;
DROP TABLE IF EXISTS leave_config_patch CASCADE;
DROP TABLE IF EXISTS leave_config_base CASCADE;
