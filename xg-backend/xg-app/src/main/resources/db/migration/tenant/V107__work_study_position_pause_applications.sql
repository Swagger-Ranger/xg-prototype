-- A1 暂停招新 — P0 简化版：用一个布尔字段控制是否接受新申请，不动 status 状态机
-- 关闭与暂停的语义差异：
--   status='closed'           → 岗位生命周期结束，不可逆（除非手动重开）
--   accepting_applications=false → 临时暂停新申请，已申请的状态不动，可随时恢复

ALTER TABLE work_study_position
    ADD COLUMN accepting_applications BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN paused_reason          VARCHAR(200);

COMMENT ON COLUMN work_study_position.accepting_applications IS '是否接受新申请：false=已暂停招新（status 仍为 open，已申请的状态不动）';
COMMENT ON COLUMN work_study_position.paused_reason          IS '暂停招新备注（可选，前端展示给申请者了解原因）';
