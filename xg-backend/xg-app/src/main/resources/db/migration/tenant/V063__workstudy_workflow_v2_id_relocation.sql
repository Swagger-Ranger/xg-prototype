-- V055 chose IDs 1005/1006 for the new work-study position + apply workflows
-- but those IDs were already taken by V045 leave_return_v1 and V046 leave_v3.
-- V055's `ON CONFLICT (id) DO NOTHING` silently skipped them, so only
-- workstudy_salary_v1 (1007) actually landed. The work-study position approval
-- could not advance because no workflow_definition row matched
-- biz_type='workstudy_position' AND status='published'.
--
-- This migration relocates the missing two definitions to non-colliding IDs
-- 1008 + 1009 — fresh tenants get the published rows; tenants whose V055 had
-- already inserted them (by luck of being seeded before V045/V046) stay
-- untouched via ON CONFLICT.
--
-- The YAML/JSON bodies are repeated verbatim from V055.

-- ============== 1008: workstudy_position_v1 v2 (3-stage approval) ==========

INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module, biz_type)
VALUES (
    1008,
    '${tenant_id}',
    'workstudy_position_v1',
    '勤工助学岗位发布 v2',
    2,
    $YAML$
code: workstudy_position_v1
name: 勤工助学岗位发布 v2
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 用工单位负责人发布
    next: employer_leader_review
  - id: employer_leader_review
    type: approval
    name: 用人单位领导审核
    assignee:
      role: employer_leader
      scope: same_employer
    timeout:
      duration: 72h
    next: student_affairs_review
    rejected_next: rejected
  - id: student_affairs_review
    type: approval
    name: 学生处审核
    assignee:
      role: student_affairs_officer
      scope: global
    timeout:
      duration: 72h
    next: opened
    rejected_next: rejected
  - id: opened
    type: end
    name: 岗位开放
    status: completed
  - id: rejected
    type: end
    name: 已驳回
    status: rejected
$YAML$,
    '{
      "code": "workstudy_position_v1",
      "name": "勤工助学岗位发布 v2",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"用工单位负责人发布","next":"employer_leader_review"},
        {"id":"employer_leader_review","type":"approval","name":"用人单位领导审核","assignee":{"role":"employer_leader","scope":"same_employer"},"timeout":{"duration":"72h"},"next":"student_affairs_review","rejected_next":"rejected"},
        {"id":"student_affairs_review","type":"approval","name":"学生处审核","assignee":{"role":"student_affairs_officer","scope":"global"},"timeout":{"duration":"72h"},"next":"opened","rejected_next":"rejected"},
        {"id":"opened","type":"end","name":"岗位开放","status":"completed"},
        {"id":"rejected","type":"end","name":"已驳回","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy',
    'workstudy_position'
)
ON CONFLICT (id) DO NOTHING;

-- ============== 1009: workstudy_apply_v1 v2 (1-stage dynamic assignee) ==========

INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module, biz_type)
VALUES (
    1009,
    '${tenant_id}',
    'workstudy_apply_v1',
    '勤工助学岗位申请 v2',
    2,
    $YAML$
code: workstudy_apply_v1
name: 勤工助学岗位申请 v2
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 学生申请
    next: position_owner_review
  - id: position_owner_review
    type: approval
    name: 岗位负责人审核
    assignee:
      role: position_owner
      scope: same_position
    timeout:
      duration: 72h
    next: hired
    rejected_next: rejected
  - id: hired
    type: end
    name: 已录用
    status: completed
  - id: rejected
    type: end
    name: 已拒绝
    status: rejected
$YAML$,
    '{
      "code": "workstudy_apply_v1",
      "name": "勤工助学岗位申请 v2",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"学生申请","next":"position_owner_review"},
        {"id":"position_owner_review","type":"approval","name":"岗位负责人审核","assignee":{"role":"position_owner","scope":"same_position"},"timeout":{"duration":"72h"},"next":"hired","rejected_next":"rejected"},
        {"id":"hired","type":"end","name":"已录用","status":"completed"},
        {"id":"rejected","type":"end","name":"已拒绝","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy',
    'workstudy_application'
)
ON CONFLICT (id) DO NOTHING;
