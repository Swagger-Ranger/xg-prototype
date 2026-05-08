-- Seed a 销假 (return-from-leave) workflow definition. Triggered when a
-- student wants to revoke an already-approved leave (early return / cancel).
-- Form fields are editable via 表单管理 afterward.
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

INSERT INTO workflow_definition (id, tenant_id, code, name, version, biz_type, config_yaml, config_json, status, module)
VALUES (
    1005,
    '${tenant_id}',
    'leave_return_v1',
    '销假审批',
    1,
    'leave_return',
$YAML$
code: leave_return_v1
name: 销假审批
module: leave
start: start
form:
  fields:
  - name: actual_return_time
    label: 实际归校时间
    type: date
    required: true
    placeholder: 选择实际回校日期
  - name: return_reason
    label: 销假说明
    type: string
    widget: textarea
    required: true
    placeholder: 简要说明销假原因（提前归校 / 假期取消 / 健康好转 等）
    maxLength: 500
  - name: health_ok
    label: 健康声明
    type: boolean
    required: true
nodes:
- id: start
  type: form_submit
  name: 申请销假
  next: counselor_review
- id: counselor_review
  type: approval
  name: 班主任审核
  assignee:
    role: counselor
    scope: same_class
  timeout:
    duration: 48h
  next: returned
  rejected_next: cancelled_reject
- id: returned
  type: end
  name: 销假通过
  status: completed
- id: cancelled_reject
  type: end
  name: 销假驳回
  status: rejected
$YAML$,
'{
   "code": "leave_return_v1",
   "name": "销假审批",
   "module": "leave",
   "start": "start",
   "form": {
     "fields": [
       {"name":"actual_return_time","label":"实际归校时间","type":"date","required":true,"placeholder":"选择实际回校日期"},
       {"name":"return_reason","label":"销假说明","type":"string","widget":"textarea","required":true,"placeholder":"简要说明销假原因（提前归校 / 假期取消 / 健康好转 等）","maxLength":500},
       {"name":"health_ok","label":"健康声明","type":"boolean","required":true}
     ]
   },
   "nodes": [
     {"id":"start","type":"form_submit","name":"申请销假","next":"counselor_review"},
     {"id":"counselor_review","type":"approval","name":"班主任审核","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"returned","rejected_next":"cancelled_reject"},
     {"id":"returned","type":"end","name":"销假通过","status":"completed"},
     {"id":"cancelled_reject","type":"end","name":"销假驳回","status":"rejected"}
   ]
 }'::jsonb,
    'published',
    'leave'
)
ON CONFLICT (id) DO NOTHING;
