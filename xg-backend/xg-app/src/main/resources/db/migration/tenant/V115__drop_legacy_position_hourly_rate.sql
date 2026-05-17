-- P1-6 Step 2: 收口 work_study_position 薪资字段到 salary_unit + salary_amount。
--
-- V018/V030 创建 hourly_rate NOT NULL；V052 引入 salary_unit + salary_amount；
-- V062 已经 DROP NOT NULL。本 migration 完成最后一步：
--   1) 把仅有 hourly_rate 的存量数据迁到 salary_unit='hour' + salary_amount
--   2) DROP COLUMN hourly_rate
--
-- 注意：work_study_salary 表的 hourly_rate（薪资行快照）是另一回事，保留。

UPDATE work_study_position
   SET salary_unit   = 'hour',
       salary_amount = hourly_rate
 WHERE salary_amount IS NULL
   AND hourly_rate IS NOT NULL;

ALTER TABLE work_study_position DROP COLUMN hourly_rate;
