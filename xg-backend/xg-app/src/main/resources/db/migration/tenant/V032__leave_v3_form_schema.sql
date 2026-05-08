-- Add a demo form schema to the published leave_v3 definition so the
-- FormDataValidator has something to enforce. No-op for tenants that
-- don't have leave_v3 yet.

UPDATE workflow_definition
SET
    config_yaml = $YAML$
code: leave_v3
name: 请假审批-3级
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
      pattern: "^1[3-9]\\d{9}$"
    - name: transportation
      label: 出行方式
      type: string
      required: false
      options: [train, flight, bus, other]
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
    config_json = jsonb_set(
        config_json,
        '{form}',
        '{
          "fields": [
            {"name":"destination","label":"目的地","type":"string","required":true,"placeholder":"例如 北京市海淀区"},
            {"name":"emergency_contact","label":"紧急联系人电话","type":"string","required":true,"pattern":"^1[3-9]\\d{9}$"},
            {"name":"transportation","label":"出行方式","type":"string","required":false,"options":["train","flight","bus","other"]}
          ]
        }'::jsonb,
        true
    ),
    updated_at = NOW()
WHERE code = 'leave_v3' AND status = 'published';
