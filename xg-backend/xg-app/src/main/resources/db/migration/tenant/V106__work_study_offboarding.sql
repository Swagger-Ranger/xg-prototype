-- A2 离岗（offboarding）— P0 简化版：不走 workflow，由直接动作 + 审计字段记录
-- engagement_status：hired 之后的生命周期（on_duty → offboarded），与审批 status 解耦
-- offboard_reason 固定 3 个枚举（avoid Jinzhi's 10+ 配置爆炸）：
--   completed                = 任期到期 / 自然结束
--   terminated_by_employer   = 用人单位终止
--   resigned_by_student      = 学生主动离岗

ALTER TABLE work_study_application
    ADD COLUMN engagement_status    VARCHAR(32),
    ADD COLUMN engaged_at           TIMESTAMPTZ,
    ADD COLUMN offboarded_at        TIMESTAMPTZ,
    ADD COLUMN offboard_reason      VARCHAR(32),
    ADD COLUMN offboard_note        TEXT,
    ADD COLUMN offboard_operator_id BIGINT;

-- 存量 hired 记录视为已在岗（无法精确知道实际到岗时间，用 decided_at 兜底）
UPDATE work_study_application
   SET engagement_status = 'on_duty',
       engaged_at        = COALESCE(decided_at, updated_at)
 WHERE status = 'hired';

CREATE INDEX idx_ws_app_engagement ON work_study_application(engagement_status);

COMMENT ON COLUMN work_study_application.engagement_status    IS '在岗生命周期：on_duty=在岗 / offboarded=已离岗（仅 hired 后置位）';
COMMENT ON COLUMN work_study_application.offboard_reason      IS '离岗原因：completed=到期 / terminated_by_employer=单位终止 / resigned_by_student=学生主动';
COMMENT ON COLUMN work_study_application.offboard_note        IS '离岗自由文本说明（可后置由 AI 归类，无强制枚举）';
COMMENT ON COLUMN work_study_application.offboard_operator_id IS '执行离岗动作的操作员 user_id（employer 终止时 = employer user_id；学生主动时 = student_id）';
