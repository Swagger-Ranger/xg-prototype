-- Drop the trailing "-3级" from the leave_v3 workflow's display name. It
-- was a holdover from the original 3-level seed ("学生 → 班主任 → 院领导")
-- but the actual flow is 2-level today. The label has no business meaning;
-- this rename is cosmetic only.

UPDATE workflow_definition
SET name = '请假审批'
WHERE code = 'leave_v3' AND name = '请假审批-3级';

-- Also patch the config_yaml so the name shown in YAML (when admins click
-- 「查看」) stays consistent with the column.
UPDATE workflow_definition
SET config_yaml = REPLACE(config_yaml, 'name: 请假审批-3级', 'name: 请假审批')
WHERE code = 'leave_v3' AND config_yaml LIKE '%请假审批-3级%';

-- Same patch for the JSONB snapshot.
UPDATE workflow_definition
SET config_json = jsonb_set(config_json, '{name}', '"请假审批"'::jsonb, true)
WHERE code = 'leave_v3' AND config_json->>'name' = '请假审批-3级';
