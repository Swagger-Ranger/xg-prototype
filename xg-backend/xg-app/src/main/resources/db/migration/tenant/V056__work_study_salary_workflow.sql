-- Work-study salary now supports manual employer-driven submission (separate
-- from the existing timesheet-derived auto-settlement flow). New columns:
--   workflow_instance_id  → links to the 1007 salary workflow
--   position_type         → user-explicit requirement (snapshot)
--   units / unit_type / unit_rate → matches position.salary_unit (hour/day/month/per_task)
--   reporter_id / report_note → who submitted, with optional note
--
-- timesheet_id is now nullable (manual salaries don't come from a timesheet).
-- The existing unique index is rewritten to scope to non-null timesheets only.

ALTER TABLE work_study_salary
    ALTER COLUMN timesheet_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS workflow_instance_id BIGINT,
    ADD COLUMN IF NOT EXISTS position_type        VARCHAR(16),
    ADD COLUMN IF NOT EXISTS units                NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS unit_type            VARCHAR(16),
    ADD COLUMN IF NOT EXISTS unit_rate            NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS reporter_id          BIGINT,
    ADD COLUMN IF NOT EXISTS report_note          TEXT;

DROP INDEX IF EXISTS uq_ws_salary_timesheet;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_salary_timesheet
    ON work_study_salary(timesheet_id)
    WHERE timesheet_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ws_salary_position ON work_study_salary(position_id, month);
CREATE INDEX IF NOT EXISTS idx_ws_salary_status   ON work_study_salary(status);

COMMENT ON COLUMN work_study_salary.position_type IS '岗位类型快照：fixed / temporary（用户明确要求工资表带岗位类型）';
COMMENT ON COLUMN work_study_salary.unit_type     IS '计薪单位：hour / day / month / per_task（来自 position.salary_unit）';
COMMENT ON COLUMN work_study_salary.units         IS '本次申报的工作量（小时数 / 天数 / 月数 / 次数）';
