-- Add biz_type column to workflow_definition so Service layer can resolve
-- "which published definition belongs to leave / workstudy_position / ..."
-- without hardcoding definition codes.
--
-- biz_type values must match what Service layer passes as bizType when starting
-- a workflow instance (see LeaveService / WorkStudyService).

ALTER TABLE workflow_definition ADD COLUMN IF NOT EXISTS biz_type VARCHAR(64);

UPDATE workflow_definition SET biz_type = 'leave'                WHERE code = 'leave_v2'               AND biz_type IS NULL;
UPDATE workflow_definition SET biz_type = 'workstudy_position'   WHERE code = 'workstudy_position_v1'  AND biz_type IS NULL;
UPDATE workflow_definition SET biz_type = 'workstudy_application' WHERE code = 'workstudy_apply_v1'    AND biz_type IS NULL;
UPDATE workflow_definition SET biz_type = 'workstudy_timesheet'  WHERE code = 'workstudy_timesheet_v1' AND biz_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_wf_def_biz_type_status
    ON workflow_definition(biz_type, status);
