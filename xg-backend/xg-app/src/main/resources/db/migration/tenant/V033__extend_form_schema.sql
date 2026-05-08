-- Extend form schema pipeline to complaint + workstudy application:
-- 1. add form_data JSONB column to both tables
-- 2. insert a complaint workflow_definition (schema-only, no approval) to host the schema
-- 3. add a form: block to the published workstudy_apply_v1 definition

ALTER TABLE complaint
    ADD COLUMN IF NOT EXISTS form_data JSONB;
ALTER TABLE work_study_application
    ADD COLUMN IF NOT EXISTS form_data JSONB;

-- Complaint schema carrier (start → end, no assignee resolution needed)
INSERT INTO workflow_definition (id, tenant_id, code, name, version, biz_type, config_yaml, config_json, status, module)
VALUES (
    1005,
    '${tenant_id}',
    'complaint_v1',
    '诉求表单 schema',
    1,
    'complaint',
$YAML$
code: complaint_v1
name: 诉求表单 schema
module: complaint
start: start
form:
  fields:
    - name: urgency
      label: 紧急程度
      type: string
      required: true
      options: [low, medium, high]
    - name: preferred_contact
      label: 期望联系方式
      type: string
      required: true
      options: [phone, wechat, email, none]
    - name: expect_reply_days
      label: 期望回复天数
      type: number
      required: false
      placeholder: 默认 3
nodes:
  - id: start
    type: form_submit
    name: 学生提交
    next: done
  - id: done
    type: end
    name: 已提交
    status: completed
$YAML$,
    '{
      "code": "complaint_v1",
      "name": "诉求表单 schema",
      "module": "complaint",
      "start": "start",
      "form": {
        "fields": [
          {"name":"urgency","label":"紧急程度","type":"string","required":true,"options":["low","medium","high"]},
          {"name":"preferred_contact","label":"期望联系方式","type":"string","required":true,"options":["phone","wechat","email","none"]},
          {"name":"expect_reply_days","label":"期望回复天数","type":"number","required":false,"placeholder":"默认 3"}
        ]
      },
      "nodes": [
        {"id":"start","type":"form_submit","name":"学生提交","next":"done"},
        {"id":"done","type":"end","name":"已提交","status":"completed"}
      ]
    }'::jsonb,
    'published',
    'complaint'
)
ON CONFLICT (id) DO NOTHING;

-- workstudy_apply_v1: inject form schema into existing published definition
UPDATE workflow_definition
SET
    config_json = jsonb_set(
        config_json,
        '{form}',
        '{
          "fields": [
            {"name":"available_hours_per_week","label":"每周可工时","type":"number","required":true,"placeholder":"建议 10-20"},
            {"name":"motivation","label":"申请动机","type":"string","required":true,"placeholder":"为什么想申请这个岗位"},
            {"name":"has_prior_experience","label":"有过勤工助学经历","type":"boolean","required":false}
          ]
        }'::jsonb,
        true
    ),
    updated_at = NOW()
WHERE code = 'workstudy_apply_v1' AND status = 'published';
