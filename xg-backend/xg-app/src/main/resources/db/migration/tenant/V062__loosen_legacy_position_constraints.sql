-- V052 introduced salary_unit + salary_amount as the canonical pricing fields
-- and noted "old columns hourly_rate / department_name / weekly_hours are kept
-- for backward compatibility — new code writes the new fields". V052 forgot to
-- drop the NOT NULL on hourly_rate (and department_name), so the new code path
-- on createPosition fails the constraint when hourly_rate isn't supplied.
--
-- Loosen the constraints so legacy fields stay queryable but no longer block
-- writes. Existing rows are unchanged.

ALTER TABLE work_study_position ALTER COLUMN hourly_rate DROP NOT NULL;
ALTER TABLE work_study_position ALTER COLUMN department_name DROP NOT NULL;
