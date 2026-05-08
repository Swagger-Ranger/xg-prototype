-- leave_v2 workflow definition (design §3.11, Step 1 of workflow engine wiring)
-- Flow: 学生提交 → 班主任审批 → （duration_days > 3 时）学院审批 → 结束
-- 任一审批 reject → rejected_next → 已驳回
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module)
VALUES (
    1001,
    '${tenant_id}',
    'leave_v2',
    '请假审批',
    1,
$YAML$
code: leave_v2
name: 请假审批
module: leave
start: start
nodes:
  - id: start
    type: form_submit
    name: 学生提交
    next: counselor_approval
  - id: counselor_approval
    type: approval
    name: 班主任审批
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
      - when: "duration_days > 3"
        next: college_approval
      - when: default
        next: approved
  - id: college_approval
    type: approval
    name: 学院审批
    assignee:
      role: dean
      scope: same_college
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected
  - id: approved
    type: end
    name: 已通过
    status: completed
  - id: rejected
    type: end
    name: 已驳回
    status: rejected
$YAML$,
    '{
      "code": "leave_v2",
      "name": "请假审批",
      "module": "leave",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"学生提交","next":"counselor_approval"},
        {"id":"counselor_approval","type":"approval","name":"班主任审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"duration_check","rejected_next":"rejected"},
        {"id":"duration_check","type":"condition","name":"时长判断","branches":[{"when":"duration_days > 3","next":"college_approval"},{"when":"default","next":"approved"}]},
        {"id":"college_approval","type":"approval","name":"学院审批","assignee":{"role":"dean","scope":"same_college"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},
        {"id":"approved","type":"end","name":"已通过","status":"completed"},
        {"id":"rejected","type":"end","name":"已驳回","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'leave'
)
ON CONFLICT (id) DO NOTHING;
