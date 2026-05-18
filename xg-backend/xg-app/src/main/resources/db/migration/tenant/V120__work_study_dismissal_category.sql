-- 勤工助学：雇主侧"单位终止"的子分类，用于主动关怀工作台 R011 规则精准触发。
-- 仅当 offboard_reason='terminated_by_employer' 时雇主端要求填写；其它 reason 保持 NULL。
-- 维度（5 选 1，决定是否升级为关怀任务）：
--   performance        工作表现 / 能力不达标       → 中等信号
--   discipline         违反岗位纪律（旷工 / 顶替 / 冲突）→ 强行为信号
--   position_dissolved 单位裁岗 / 项目结束（学生无责）→ 不触发预警
--   mismatch           双方匹配不佳（中性）         → 不触发预警
--   other              其他（备注必填）             → 中等信号
ALTER TABLE work_study_application
    ADD COLUMN IF NOT EXISTS dismissal_category VARCHAR(32);

COMMENT ON COLUMN work_study_application.dismissal_category IS
    '雇主辞退子分类：performance/discipline/position_dissolved/mismatch/other；仅 reason=terminated_by_employer 时填写';

-- 部分索引：只有被辞且分类已填的记录值得 索引，规则引擎扫描 R011 时直接命中。
CREATE INDEX IF NOT EXISTS idx_wsapp_dismissal_category
    ON work_study_application(dismissal_category, offboarded_at DESC)
    WHERE dismissal_category IS NOT NULL;
