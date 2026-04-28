-- Form-schema tweaks for the request page:
--   1. drop transportation (火车/飞机/...)  — surveyed redundant
--   2. destination changes from free-text Input to a province/prefecture
--      Cascader (frontend renders widget='cascader'). Stored value is still
--      the leaf city name (string), so submitted form_data shape stays the
--      same as before — only the editor UX changes.
--
-- Touch only the published leave_v3 row's config_json. The independent
-- updateFormFields endpoint (FormFieldsEditor) writes config_json directly
-- when admins edit fields through the UI; we mirror its shape.
-- Idempotent: filter on existing transportation field, fallback to no-op.

UPDATE workflow_definition
SET config_json = jsonb_set(
        config_json,
        '{form,fields}',
        (
            SELECT jsonb_agg(
                CASE
                    WHEN field->>'name' = 'destination' THEN
                        field
                            || jsonb_build_object('widget', 'cascader')
                            || jsonb_build_object('placeholder', '请选择省/市')
                    ELSE field
                END
                ORDER BY ord
            )
            FROM jsonb_array_elements(config_json->'form'->'fields') WITH ORDINALITY AS f(field, ord)
            WHERE field->>'name' <> 'transportation'
        )
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
