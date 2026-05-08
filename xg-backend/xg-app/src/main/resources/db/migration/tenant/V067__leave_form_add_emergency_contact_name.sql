-- 把「紧急联系人」(姓名) 加入 leave_v3 表单 schema，紧跟在目的地之后、
-- 紧急联系人电话之前。required=false：profile 已 seed 占位值 (V066) 时
-- 由前端自动回填；偶有缺失也不阻塞提交。
--
-- 与 V061 一样直接覆盖 config_json/config_yaml；P0 阶段表单字段不多，且
-- admin 通过 FormFieldsEditor 改动时也会整段写回，与本次重写互不破坏。
UPDATE workflow_definition
SET config_json = jsonb_set(
        config_json,
        '{form,fields}',
        '[
            {"name":"destination","label":"目的地","type":"string","widget":"cascader","required":true,"placeholder":"请选择省/市"},
            {"name":"emergency_contact_name","label":"紧急联系人","type":"string","required":false,"placeholder":"联系人姓名"},
            {"name":"emergency_contact","label":"紧急联系人电话","type":"string","required":true,"pattern":"^1[3-9]\\d{9}$"}
        ]'::jsonb
    ),
    config_yaml = $YAML$
code: leave_v3
name: 请假审批
module: leave
start: start
form:
  fields:
  - name: destination
    label: 目的地
    type: string
    widget: cascader
    required: true
    placeholder: 请选择省/市
  - name: emergency_contact_name
    label: 紧急联系人
    type: string
    required: false
    placeholder: 联系人姓名
  - name: emergency_contact
    label: 紧急联系人电话
    type: string
    required: true
    pattern: ^1[3-9]\d{9}$
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
    updated_at = NOW()
WHERE code = 'leave_v3'
  AND status = 'published';
