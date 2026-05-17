-- 主动关怀 W5：care_task_audit 支持"非任务状态转移"类审计（PRD §13.1）。
--
-- V123 建表时 care_task_audit 只服务任务状态机留痕，task_id / from_status /
-- to_status 都 NOT NULL。W5 引入学生级"下钻"审计（drilled_down）—— 它不挂在
-- 某个任务上、也没有状态转移，task_id 必须可空（PRD §13.1 明确「task_id 可为空
-- 用于学生下钻类审计」），from_status / to_status 同理对非转移类动作无意义。
--
-- 放开这三列的 NOT NULL，使该表从"状态机日志"扩为"关怀审计日志"。
-- 状态转移类动作（accept/resolve/...）仍由 service 层写全字段，语义不变。

ALTER TABLE care_task_audit ALTER COLUMN task_id     DROP NOT NULL;
ALTER TABLE care_task_audit ALTER COLUMN from_status DROP NOT NULL;
ALTER TABLE care_task_audit ALTER COLUMN to_status   DROP NOT NULL;

COMMENT ON COLUMN care_task_audit.task_id IS '关联任务；学生级下钻审计(drilled_down)无任务，为空';
COMMENT ON COLUMN care_task_audit.from_status IS '转移前状态；非状态转移类审计(如 drilled_down)为空';
COMMENT ON COLUMN care_task_audit.to_status IS '转移后状态；非状态转移类审计(如 drilled_down)为空';
