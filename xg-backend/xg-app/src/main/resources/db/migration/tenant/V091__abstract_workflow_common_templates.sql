-- 把"待审批到达 / 审批通过 / 审批驳回"3 条模板从 leave 专属抽象成跨业务通用,
-- biz_module 改成 _common,管理员改一次全系统所有流程都生效。文案改成
-- {{biz_label}} + {{summary}} 占位,业务侧调用时自己拼具体词(如"请假" /
-- "事假 5/10-5/12 共 3 天")。
--
-- LEAVE_RETURNED 不抽象 — 销假是 leave 专属概念,放保留。
-- LEAVE_APPROVAL_PENDING 改名 WORKFLOW_TASK_ARRIVED 但 enabled=false:
-- 当前 LeaveWorkflowListener 不会触发它(workflow 引擎的 task_assigned 事件
-- 还没接 listener),P1 接通后再 enable。

UPDATE notification_template SET
    code = 'WORKFLOW_TASK_ARRIVED',
    biz_module = '_common',
    enabled = FALSE,
    title_tmpl = '{{biz_label}}待审批',
    body_tmpl = '{{summary}},请尽快审批。',
    description = '工作流任务到达审批人(P1 接通 task_assigned 事件后启用)',
    updated_at = NOW()
WHERE tenant_id = '${tenant_id}' AND code = 'LEAVE_APPROVAL_PENDING';

UPDATE notification_template SET
    code = 'WORKFLOW_APPROVED',
    biz_module = '_common',
    title_tmpl = '{{biz_label}}已通过',
    body_tmpl = '您的{{summary}}已通过审批。',
    description = '工作流终态通过,通知申请人',
    updated_at = NOW()
WHERE tenant_id = '${tenant_id}' AND code = 'LEAVE_APPROVED';

UPDATE notification_template SET
    code = 'WORKFLOW_REJECTED',
    biz_module = '_common',
    title_tmpl = '{{biz_label}}被驳回',
    body_tmpl = '您的{{summary}}申请未通过。原因:{{reject_reason}}',
    description = '工作流终态驳回,通知申请人',
    updated_at = NOW()
WHERE tenant_id = '${tenant_id}' AND code = 'LEAVE_REJECTED';

-- 同步已有的 notification.template_code(P0 时段可能已经发过几条)
UPDATE notification SET template_code = 'WORKFLOW_APPROVED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_APPROVED';
UPDATE notification SET template_code = 'WORKFLOW_REJECTED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_REJECTED';
UPDATE notification SET template_code = 'WORKFLOW_TASK_ARRIVED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_APPROVAL_PENDING';

-- 同步偏好覆盖(管理员可能已配过角色级偏好)
UPDATE notification_preference SET template_code = 'WORKFLOW_APPROVED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_APPROVED';
UPDATE notification_preference SET template_code = 'WORKFLOW_REJECTED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_REJECTED';
UPDATE notification_preference SET template_code = 'WORKFLOW_TASK_ARRIVED'
WHERE tenant_id = '${tenant_id}' AND template_code = 'LEAVE_APPROVAL_PENDING';
