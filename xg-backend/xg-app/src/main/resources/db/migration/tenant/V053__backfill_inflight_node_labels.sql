-- Backfill in-flight workflow snapshots + task rows after V051 renamed the
-- approval node display labels. Without this, instances that started before
-- V051 keep showing the old names (班主任审批 / 学院审批 / 班主任审核) on
-- the timeline because the engine reads workflow_instance.definition_snapshot,
-- not workflow_definition.config_json.
--
-- Only the textual `name` is changed — id/type/next/assignee.role all stay
-- as-is, so this is purely cosmetic and doesn't affect routing, completed
-- decisions, or audit history. Idempotent via REPLACE.

-- 1) definition_snapshot on every workflow_instance whose snapshot still
--    carries an old label. Stored as JSONB; a string REPLACE on the text
--    representation cast back to jsonb is safe because the labels don't
--    appear elsewhere in the snapshot (no field named "学院审批" etc.).
UPDATE workflow_instance
SET definition_snapshot = REPLACE(
        REPLACE(
            REPLACE(definition_snapshot::text, '"班主任审批"', '"辅导员审批"'),
            '"学院审批"', '"院系领导审批"'
        ),
        '"班主任审核"', '"辅导员审核"'
    )::jsonb,
    updated_at = NOW()
WHERE definition_snapshot::text LIKE '%班主任审批%'
   OR definition_snapshot::text LIKE '%学院审批%'
   OR definition_snapshot::text LIKE '%班主任审核%';

-- 2) task_instance.node_name carries a frozen copy of the snapshot's name
--    field at task creation. Update so per-row APIs (pending-enriched,
--    timeline) show the new label.
UPDATE task_instance
SET node_name = '辅导员审批',
    updated_at = NOW()
WHERE node_name = '班主任审批';

UPDATE task_instance
SET node_name = '院系领导审批',
    updated_at = NOW()
WHERE node_name = '学院审批';

UPDATE task_instance
SET node_name = '辅导员审核',
    updated_at = NOW()
WHERE node_name = '班主任审核';
