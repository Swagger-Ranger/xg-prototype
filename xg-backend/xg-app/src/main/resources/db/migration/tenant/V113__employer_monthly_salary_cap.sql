-- 用工单位月薪酬发放上限（金智 FRS line 2647 "维护每个部门的每月勤工助学薪酬的发放上限"）。
-- 校管理员在用工单位编辑表单里设定;WorkStudySalaryService.submit 时累计当月 status<>'rejected'
-- 的所有 salary 行 + 当前申报金额,超过即抛 SALARY_CAP_EXCEEDED。
-- NULL = 不限,这是新字段的默认值,不影响已存量数据。

ALTER TABLE employer
    ADD COLUMN IF NOT EXISTS monthly_salary_cap NUMERIC(10, 2);

COMMENT ON COLUMN employer.monthly_salary_cap IS
    '本单位每月勤工助学薪酬发放上限(元);NULL=不限;校管理员在用工单位编辑页设定';
