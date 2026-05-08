-- 通知收件人配置 — 把"谁收到这条通知"从硬编码改成模板可配。
-- recipients JSONB 是一个对象数组,每项指定一个 RecipientType + 可选 cc 标记。
--
-- 例:[{"type":"applicant"},{"type":"applicant_counselor","cc":true}]
-- 翻译:学生本人 + 申请人的辅导员(抄送)
--
-- P0 支持的 type 见 RecipientType enum。"static_user" 需要额外 user_id 字段:
-- {"type":"static_user","user_id":12345}
--
-- "cc" 字段 P0 仅作 UI 标签(主送 / 抄送),Orchestrator 不区分投递行为。

ALTER TABLE notification_template
    ADD COLUMN IF NOT EXISTS recipients JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN notification_template.recipients IS
    '收件人配置(管理员可改),结构:[{"type":"<RecipientType>","cc":<bool>,...}]';

-- 各模板默认收件人
UPDATE notification_template SET recipients =
    '[{"type":"current_approver"}]'::jsonb
WHERE tenant_id = '${tenant_id}' AND code = 'WORKFLOW_TASK_ARRIVED';

UPDATE notification_template SET recipients =
    '[{"type":"applicant"}]'::jsonb
WHERE tenant_id = '${tenant_id}' AND code IN (
    'WORKFLOW_APPROVED', 'WORKFLOW_REJECTED', 'LEAVE_RETURNED',
    'REMINDER_LEAVE_START', 'REMINDER_PRE_END', 'REMINDER_DUE',
    'CARE_PERSONAL_TRAVEL_WEATHER', 'CARE_NEAR_RETURN_REMINDER', 'CARE_SICK_LEAVE'
);

-- OVERDUE 合并辅导员抄送(取消 OVERDUE_COUNSELOR 单独模板的必要性)
UPDATE notification_template SET recipients =
    '[{"type":"applicant"},{"type":"applicant_counselor","cc":true}]'::jsonb
WHERE tenant_id = '${tenant_id}' AND code = 'REMINDER_OVERDUE';

-- 删掉 REMINDER_OVERDUE_COUNSELOR — 抄送已合并到 OVERDUE 的 recipients
-- 现有 notification 历史行的 template_code 保留(归档,不影响新通知投递)
-- 偏好覆盖迁移:之前给 OVERDUE_COUNSELOR 配过的偏好,跟 OVERDUE 合并(如果两都有,
-- 唯一约束会冲突 — 用 INSERT...DO NOTHING 模式跳过冲突)
UPDATE notification_preference SET template_code = 'REMINDER_OVERDUE'
WHERE tenant_id = '${tenant_id}'
  AND template_code = 'REMINDER_OVERDUE_COUNSELOR'
  AND NOT EXISTS (
      SELECT 1 FROM notification_preference p2
      WHERE p2.tenant_id = notification_preference.tenant_id
        AND p2.scope_type = notification_preference.scope_type
        AND p2.scope_value = notification_preference.scope_value
        AND p2.template_code = 'REMINDER_OVERDUE'
  );
DELETE FROM notification_preference
WHERE tenant_id = '${tenant_id}' AND template_code = 'REMINDER_OVERDUE_COUNSELOR';

DELETE FROM notification_template
WHERE tenant_id = '${tenant_id}' AND code = 'REMINDER_OVERDUE_COUNSELOR';
