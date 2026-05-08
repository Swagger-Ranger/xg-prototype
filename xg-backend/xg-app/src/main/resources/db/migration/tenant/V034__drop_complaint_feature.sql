-- Completely remove the complaint ("接诉即办") feature.
-- Prototype-phase cleanup: no production data to preserve.

-- 1. Drop any alerts that reference the complaint alert rule (alert_rule_id=3)
DELETE FROM student_alert WHERE alert_rule_id = 3;

-- 2. Drop the complaint-spike alert rule (id=3, seeded in V023, already disabled in V028)
DELETE FROM alert_rule WHERE id = 3;

-- 3. Drop sample / historical events of type complaint_submitted
DELETE FROM student_event_log WHERE event_type = 'complaint_submitted';

-- 4. Drop the complaint workflow definition seeded in V033
DELETE FROM workflow_definition WHERE code = 'complaint_v1';

-- 5. Drop role-permission links and permissions for complaint actions
DELETE FROM sys_role_permission WHERE permission_id IN (601, 602);
DELETE FROM sys_permission WHERE id IN (601, 602);

-- 6. Drop the complaint table (V013 created it)
DROP TABLE IF EXISTS complaint CASCADE;
