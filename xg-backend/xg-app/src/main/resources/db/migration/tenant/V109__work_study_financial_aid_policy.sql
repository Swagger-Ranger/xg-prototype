-- B3 困难生倾斜策略 — 把隐式 prefer_financial_aid 升级成显式 4 选 1 策略
--
-- 4 个枚举值（朝夕 vs 金智的简化原则：枚举不要权重矩阵）：
--   none      不倾斜（默认）
--   bonus     加分项 — AI 推荐时困难生 +10（权重写死，不让用户配）
--   reserved  保底名额 — reserved_count 个名额优先困难生（P0 仅作展示提示，
--             不在 decideApplication 强校验）
--   only      仅限困难生申请 — apply() 时强校验，非困难生直接拒
--
-- 保留旧 prefer_financial_aid 字段做向后兼容（前端/旧 query 不会突然空）。
-- TRUE → 'bonus'（最自然映射；TRUE 意图就是"倾向"，不是"独占"也不是"保底名额"）。

ALTER TABLE work_study_position
    ADD COLUMN financial_aid_policy VARCHAR(16) NOT NULL DEFAULT 'none',
    ADD COLUMN reserved_count       INT;

UPDATE work_study_position
   SET financial_aid_policy = 'bonus'
 WHERE prefer_financial_aid = TRUE;

COMMENT ON COLUMN work_study_position.financial_aid_policy IS '困难生策略：none/bonus/reserved/only';
COMMENT ON COLUMN work_study_position.reserved_count       IS 'reserved 策略下，留给困难生的名额数；仅作 AI 推荐与展示提示';
