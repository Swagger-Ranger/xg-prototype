-- Two fixes for the dean-side approval flow.
--
-- Symptom 1: "院领导处 请销假管理列表中没有审批/驳回按钮" — dean sees no
--   pending tasks because the engine logged "No assignees found for node
--   college_approval", so no task_instance row was ever created for the
--   stuck v7 leave that reached the dean step.
-- Symptom 2: "查看处 流程进度加载失败" — InstanceTimelineService.authorize()
--   only allows the initiator, school_admin, or any task assignee. Dean was
--   never an assignee, so they got FORBIDDEN.
--
-- Root cause: V022 seeded dean1 with sys_user_role(role_id=4) but
-- org_id=NULL, so AssigneeLookupMapper.findDeansOfStudent — which joins
-- ur.org_id = college.id — never matched.
--
-- Fix:
--   1) Bind dean1 to 计算机学院 (1001) so the lookup finds them. The PK is
--      (user_id, role_id) so we UPDATE the existing row, not INSERT.
--   2) Backfill the missing college_approval task_instance for any v7 leave
--      whose workflow_instance is stuck at college_approval with no pending
--      task. After this, the dean is the assignee → list shows buttons,
--      timeline view passes the assignee check.
--
-- The college binding is demo-data-only; production deans should be assigned
-- via the admin UI and we shouldn't re-run this on every tenant restart.
-- Idempotency: UPDATE is conditional on org_id IS NULL, INSERT uses NOT EXISTS.

UPDATE sys_user_role
SET org_id = 1001
WHERE user_id = 2102
  AND role_id = 4
  AND org_id IS NULL;

-- task_instance.id has no DB default — snowflake IDs are normally assigned
-- by MyBatis-Plus' IdType.ASSIGN_ID at app layer. We're inserting from SQL,
-- so synthesize a unique bigint by combining workflow_instance_id with a
-- per-node tag. Hash gives plenty of room and stays inside bigint.
INSERT INTO task_instance (
    id, workflow_instance_id, node_id, node_name,
    assignee_id, status, assigned_at, due_at, tenant_id
)
SELECT
    abs(hashtextextended('backfill_college_' || wi.id::text, 0)),
    wi.id,
    'college_approval',
    '院系领导审批',
    2102,
    'pending',
    NOW(),
    NOW() + INTERVAL '72 hours',
    wi.tenant_id
FROM workflow_instance wi
WHERE wi.biz_type = 'leave'
  AND wi.status = 'running'
  AND wi.current_node_id = 'college_approval'
  AND NOT EXISTS (
      SELECT 1 FROM task_instance ti
      WHERE ti.workflow_instance_id = wi.id
        AND ti.node_id = 'college_approval'
        AND ti.status = 'pending'
  );
