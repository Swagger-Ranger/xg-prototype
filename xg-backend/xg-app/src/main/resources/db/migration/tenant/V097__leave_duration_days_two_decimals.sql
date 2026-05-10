-- duration_days 从 NUMERIC(5,1) 升到 NUMERIC(5,2),适配新口径下 0.25 颗粒度。
--
-- 起因:V096 把累计上限改全局后,duration 算法也改成「工作时段 09:00-18:00 扣午休、
-- 8 个工作小时 = 1 天」。结果天然出现 0.25 / 0.5 / 0.75 这种半天/四分之一天小数,
-- 需要 2 位小数才存得下;原来 NUMERIC(5,1) 只能 0.0 / 0.5 / 1.0 这种半天颗粒。
--
-- 存量数据按旧口径 ceil(秒/86400) 存的整数(.0),升精度后值不变;不做回填,
-- 历史申请单天数沿用提交时口径(影响 audit 一致性,不影响新提交)。

ALTER TABLE leave_request
    ALTER COLUMN duration_days TYPE NUMERIC(5,2);

COMMENT ON COLUMN leave_request.duration_days IS
    '请假天数(工作时段口径:09:00-12:00 + 13:00-18:00, 8 工作小时 = 1 天, 周末/公共假期 0 天)。NUMERIC(5,2) 支持 0.25 / 0.75 等四分之一天颗粒度。';
