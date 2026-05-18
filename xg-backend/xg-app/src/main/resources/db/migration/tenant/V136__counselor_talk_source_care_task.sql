-- 关怀任务发起的谈话回链（与 source_alert_id 平行，单向：talk → care_task）。
-- AI 观察员「主动关怀」卡片的「发起谈话」按钮带 careTaskId 进来，记录谈话源自哪个
-- care_task。不做反向 care_task.counselor_talk_id（care_task 无该列，且不联动状态机）。

ALTER TABLE counselor_talk ADD COLUMN IF NOT EXISTS source_care_task_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_counselor_talk_care_src
    ON counselor_talk(source_care_task_id) WHERE source_care_task_id IS NOT NULL;
