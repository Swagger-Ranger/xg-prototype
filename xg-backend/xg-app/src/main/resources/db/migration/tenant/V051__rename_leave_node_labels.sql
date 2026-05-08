-- Align workflow node display names with the actual sys_role names.
--
-- sys_role: counselor=辅导员, dean=院系领导. Earlier seeds (V029/V032/V045)
-- and V050 used colloquial aliases like "班主任审批" / "学院审批" / "班主任
-- 审核" in the node `name` field, which then surfaced on the timeline UI
-- and confused approvers ("我是辅导员，为什么显示班主任").
--
-- Only the `name` (display label) is changed — `assignee.role` stays
-- counselor / dean as before. We touch the published rows for the active
-- definitions; disabled rows and frozen workflow_instance.definition_snapshot
-- are left alone so historical timelines keep reflecting whatever name was
-- shown at the time.
--
-- Idempotent via REPLACE; no-op if already renamed.

-- leave_v3 v7 (current published) — rename both nodes
UPDATE workflow_definition
SET config_yaml = REPLACE(REPLACE(config_yaml, '班主任审批', '辅导员审批'), '学院审批', '院系领导审批'),
    config_json = config_json
        || jsonb_build_object(
            'nodes',
            (
                SELECT jsonb_agg(
                    CASE node->>'id'
                        WHEN 'counselor_approval' THEN jsonb_set(node, '{name}', '"辅导员审批"'::jsonb)
                        WHEN 'college_approval'   THEN jsonb_set(node, '{name}', '"院系领导审批"'::jsonb)
                        ELSE node
                    END
                    ORDER BY n_ord
                )
                FROM jsonb_array_elements(config_json->'nodes') WITH ORDINALITY AS n(node, n_ord)
            )
        ),
    updated_at = NOW()
WHERE code = 'leave_v3'
  AND status = 'published';

-- leave_return_v1 — rename "班主任审核" → "辅导员审核"
UPDATE workflow_definition
SET config_yaml = REPLACE(config_yaml, '班主任审核', '辅导员审核'),
    config_json = config_json
        || jsonb_build_object(
            'nodes',
            (
                SELECT jsonb_agg(
                    CASE node->>'id'
                        WHEN 'counselor_review' THEN jsonb_set(node, '{name}', '"辅导员审核"'::jsonb)
                        ELSE node
                    END
                    ORDER BY n_ord
                )
                FROM jsonb_array_elements(config_json->'nodes') WITH ORDINALITY AS n(node, n_ord)
            )
        ),
    updated_at = NOW()
WHERE code = 'leave_return_v1'
  AND status = 'published';
