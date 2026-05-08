-- Workflow publicity-period node support.
--
-- 1) task_instance.assignee_id becomes NULLABLE.
--    Rationale: publicity nodes have no human approver — they're driven by
--    `due_at` and the WorkflowDueScheduler cron. Reusing task_instance keeps
--    the timeline / pending-task pipelines uniform; using NULL here is the
--    cheapest way to mark "system task, no operator".
--
-- 2) Extend the status check (informal, no CHECK constraint) to allow:
--    'auto_advanced'  — publicity timer expired; engine moved on
--    'interrupted'    — publicity got an appeal / objection mid-period
--
--    Existing values (pending / approved / rejected / skipped) untouched.
--    No CHECK constraint exists on this column today, so this is a doc-level
--    note only.
--
-- 3) Add a partial index for the scheduler scan: pending publicity-style
--    tasks with a due_at. Query pattern is "WHERE status='pending' AND
--    assignee_id IS NULL AND due_at <= NOW()".

ALTER TABLE task_instance ALTER COLUMN assignee_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_publicity_due
    ON task_instance(due_at)
    WHERE status = 'pending' AND assignee_id IS NULL;
