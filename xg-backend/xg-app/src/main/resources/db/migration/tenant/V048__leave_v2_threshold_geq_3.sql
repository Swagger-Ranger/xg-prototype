-- Tighten the leave_v2 duration branch so that exactly 3 days also requires
-- 学院 approval. Original V029 used `duration_days > 3`, which sent 3-day
-- requests through 辅导员-only; product confirmed the intent is "3 天及以上
-- 需院长审批".
--
-- Only updates the published row's snapshot. In-flight workflow_instance
-- rows keep their frozen definition_snapshot, so this is safe to apply on
-- live tenants.

UPDATE workflow_definition
SET config_yaml = REPLACE(config_yaml, 'duration_days > 3', 'duration_days >= 3')
WHERE code = 'leave_v2'
  AND config_yaml LIKE '%duration_days > 3%';

UPDATE workflow_definition
SET config_json = jsonb_set(
        config_json,
        '{nodes}',
        (
            SELECT jsonb_agg(
                CASE
                    WHEN node->>'id' = 'duration_check' THEN
                        jsonb_set(
                            node,
                            '{branches}',
                            (
                                SELECT jsonb_agg(
                                    CASE
                                        WHEN branch->>'when' = 'duration_days > 3'
                                        THEN jsonb_set(branch, '{when}', '"duration_days >= 3"'::jsonb)
                                        ELSE branch
                                    END
                                    ORDER BY b_ord
                                )
                                FROM jsonb_array_elements(node->'branches') WITH ORDINALITY AS b(branch, b_ord)
                            )
                        )
                    ELSE node
                END
                ORDER BY n_ord
            )
            FROM jsonb_array_elements(config_json->'nodes') WITH ORDINALITY AS n(node, n_ord)
        )
    ),
    updated_at = NOW()
WHERE code = 'leave_v2'
  AND config_json::text LIKE '%"duration_days > 3"%';
