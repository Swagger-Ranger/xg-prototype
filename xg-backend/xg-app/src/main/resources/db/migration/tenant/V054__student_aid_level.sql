-- Add financial-aid level to student profile, used for eligibility filtering
-- on work-study positions (and any future scholarship/aid flow).
ALTER TABLE student_profile
    ADD COLUMN IF NOT EXISTS aid_level VARCHAR(16);

COMMENT ON COLUMN student_profile.aid_level IS '困难等级：special / difficult / mild / none / NULL=未认定';

CREATE INDEX IF NOT EXISTS idx_student_profile_aid_level
    ON student_profile(aid_level)
    WHERE aid_level IS NOT NULL;
