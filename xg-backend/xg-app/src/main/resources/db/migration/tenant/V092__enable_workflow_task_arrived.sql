-- Listener TaskAssignedNotifier 接通后启用 WORKFLOW_TASK_ARRIVED 模板。
-- 之前 V091 把它 enabled=false,等 task_assigned 事件挂上 listener 后再 enable。
-- 现在 ApprovalExecutor 在 task 创建后 publishEvent,Listener 翻译成 Orchestrator
-- 调用,模板可以正式生效。

UPDATE notification_template SET
    enabled = TRUE,
    description = '工作流任务到达审批人,通知所有 assignee',
    updated_at = NOW()
WHERE tenant_id = '${tenant_id}' AND code = 'WORKFLOW_TASK_ARRIVED';
