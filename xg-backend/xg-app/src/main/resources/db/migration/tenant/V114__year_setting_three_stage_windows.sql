-- 业务时间三阶段窗口(金智 FRS line 2613 "按岗位设定、学生上岗、薪酬发放三个阶段")。
-- 学年级配置,每个阶段一对 start/end TIMESTAMPTZ。application_open boolean 仍作为
-- 总开关(快速一键关停),三阶段窗口是细粒度时段:三者各自校验对应业务入口的"是否在窗内"。
-- 任意一对 _start/_end 为 NULL = 该阶段不限时段(沿用 application_open 总开关行为)。
--
-- 各窗口在业务侧的执行点:
--   position_window  → WorkStudyService.createPosition / updatePosition
--   application_window → WorkStudyService.apply (学生申请岗位)
--   salary_window    → WorkStudySalaryService.submit (用单上报薪酬)

ALTER TABLE work_study_year_setting
    ADD COLUMN IF NOT EXISTS position_window_start    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS position_window_end      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS application_window_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS application_window_end   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS salary_window_start      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS salary_window_end        TIMESTAMPTZ;

COMMENT ON COLUMN work_study_year_setting.position_window_start    IS '岗位设定窗口起(NULL=不限);用单/校管理员在此窗口内可创建/修改岗位';
COMMENT ON COLUMN work_study_year_setting.position_window_end      IS '岗位设定窗口止';
COMMENT ON COLUMN work_study_year_setting.application_window_start IS '学生上岗(申请)窗口起;学生在此窗口内可提交岗位申请';
COMMENT ON COLUMN work_study_year_setting.application_window_end   IS '学生上岗(申请)窗口止';
COMMENT ON COLUMN work_study_year_setting.salary_window_start      IS '薪酬发放(申报)窗口起;用单在此窗口内可提交月薪酬申报';
COMMENT ON COLUMN work_study_year_setting.salary_window_end        IS '薪酬发放(申报)窗口止';
