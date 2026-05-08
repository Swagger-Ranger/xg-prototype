-- Add 培养层次 (education level) to student_profile.
-- Values: 本科 / 硕士 / 博士 / 专科. Default 本科 covers the undergrad majority.

ALTER TABLE student_profile
    ADD COLUMN IF NOT EXISTS education_level VARCHAR(16) NOT NULL DEFAULT '本科';

-- Sprinkle graduate-level students for demo variety.
-- Master's candidates
UPDATE student_profile SET education_level = '硕士'
WHERE student_no IN ('2023001006', '2023001015', '2024001001', '2024001005');

-- Doctoral candidates
UPDATE student_profile SET education_level = '博士'
WHERE student_no IN ('2021001002', '2022001005');

CREATE INDEX IF NOT EXISTS idx_student_profile_edu_level
    ON student_profile(education_level);

COMMENT ON COLUMN student_profile.education_level IS '培养层次：本科 / 硕士 / 博士 / 专科';
