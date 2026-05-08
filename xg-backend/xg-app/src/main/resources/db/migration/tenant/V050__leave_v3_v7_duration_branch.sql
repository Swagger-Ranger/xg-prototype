-- Restore the duration-based branching for leave_v3.
--
-- The currently-published leave_v3 (v6) was edited through the workflow
-- management UI and lost the duration_check / college_approval nodes that
-- V029 originally seeded on leave_v2. Result: every leave — including 8天
-- — only goes through 班主任 approval and never reaches 学院.
--
-- This migration publishes v7 with the form schema identical to v6, plus
-- the duration_check (>= 3 days → 学院 approval) branch, and demotes v6
-- to disabled so the engine's "latest published" lookup picks v7. Running
-- v6 instances are unaffected because they use workflow_instance's frozen
-- definition_snapshot, not the workflow_definition row's status.
--
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

INSERT INTO workflow_definition (id, tenant_id, code, name, version, biz_type, config_yaml, config_json, status, module)
VALUES (
    1006,
    '${tenant_id}',
    'leave_v3',
    '请假审批',
    7,
    'leave',
$YAML$
code: leave_v3
name: 请假审批
module: leave
start: start
form:
  fields:
  - name: destination
    label: 目的地
    type: string
    required: true
    placeholder: 例如 北京市海淀区
  - name: emergency_contact
    label: 紧急联系人电话
    type: string
    required: true
    pattern: ^1[3-9]\d{9}$
  - name: transportation
    label: 出行方式
    type: string
    widget: select
    options:
    - 火车
    - 飞机
    - 公共交通
    - 其他
nodes:
- id: start
  type: form_submit
  name: 学生提交
  next: counselor_approval
- id: counselor_approval
  type: approval
  name: 辅导员审批
  assignee:
    role: counselor
    scope: same_class
  timeout:
    duration: 48h
  next: duration_check
  rejected_next: rejected
- id: duration_check
  type: condition
  name: 时长判断
  branches:
  - when: "duration_days >= 3"
    next: college_approval
  - when: default
    next: approved
- id: college_approval
  type: approval
  name: 院系领导审批
  assignee:
    role: dean
    scope: same_college
  timeout:
    duration: 72h
  next: approved
  rejected_next: rejected
- id: approved
  type: end
  name: 通过
  status: completed
- id: rejected
  type: end
  name: 驳回
  status: rejected
$YAML$,
    '{
       "code": "leave_v3",
       "name": "请假审批",
       "module": "leave",
       "start": "start",
       "form": {
         "fields": [
           {"name":"destination","label":"目的地","type":"string","required":true,"placeholder":"例如 北京市海淀区"},
           {"name":"emergency_contact","label":"紧急联系人电话","type":"string","required":true,"pattern":"^1[3-9]\\d{9}$"},
           {"name":"transportation","label":"出行方式","type":"string","widget":"select","options":["火车","飞机","公共交通","其他"]}
         ]
       },
       "nodes": [
         {"id":"start","type":"form_submit","name":"学生提交","next":"counselor_approval"},
         {"id":"counselor_approval","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"duration_check","rejected_next":"rejected"},
         {"id":"duration_check","type":"condition","name":"时长判断","branches":[{"when":"duration_days >= 3","next":"college_approval"},{"when":"default","next":"approved"}]},
         {"id":"college_approval","type":"approval","name":"院系领导审批","assignee":{"role":"dean","scope":"same_college"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},
         {"id":"approved","type":"end","name":"通过","status":"completed"},
         {"id":"rejected","type":"end","name":"驳回","status":"rejected"}
       ]
     }'::jsonb,
    'published',
    'leave'
)
ON CONFLICT (id) DO NOTHING;

-- Demote any other published leave_v3 row so the management UI shows a
-- single "v7 published". Engine resolves by max(version) anyway, but
-- keeping a single published row avoids confusion.
UPDATE workflow_definition
SET status = 'disabled', updated_at = NOW()
WHERE code = 'leave_v3' AND biz_type = 'leave' AND status = 'published' AND id <> 1006;
