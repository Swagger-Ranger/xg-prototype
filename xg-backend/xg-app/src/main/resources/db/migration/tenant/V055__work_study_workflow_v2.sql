-- Work-study workflow re-design (P0b):
--   1) Position approval: 1-step → 3-step (用工部门 → 用人单位领导 → 学生处)
--   2) Application:       2-step → 1-step (学生 → 岗位负责人, dynamic assignee)
--   3) NEW Salary review:               (用工部门 → 资助中心)
--
-- Old 1002/1003 are archived; new IDs 1005/1006 take their place. Salary = 1007.
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

-- ==========================================================================
-- 0. Seed aid_center_officer role (used by 1007 salary workflow)
-- ==========================================================================
INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES (9, '${tenant_id}', 'aid_center_officer', '资助中心人员', '勤工助学薪资审批', TRUE, 9)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ==========================================================================
-- 1. Archive obsolete v1 definitions
-- ==========================================================================
UPDATE workflow_definition SET status = 'archived'
 WHERE id IN (1002, 1003) AND status = 'published';

-- ==========================================================================
-- 2. 1005: workstudy_position_v1 v2 — 3-stage approval
-- ==========================================================================
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module, biz_type)
VALUES (
    1005,
    '${tenant_id}',
    'workstudy_position_v1',
    '勤工助学岗位发布',
    2,
$YAML$
code: workstudy_position_v1
name: 勤工助学岗位发布
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
      "name": "勤工助学岗位发布",
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

-- ==========================================================================
-- 3. 1006: workstudy_apply_v1 v2 — 1-stage (审核人 = 岗位负责人, dynamic)
-- ==========================================================================
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module, biz_type)
VALUES (
    1006,
    '${tenant_id}',
    'workstudy_apply_v1',
    '勤工助学岗位申请',
    2,
$YAML$
code: workstudy_apply_v1
name: 勤工助学岗位申请
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 学生提交申请
    next: position_owner_review
  - id: position_owner_review
    type: approval
    name: 岗位负责人审核
    assignee:
      role: position_owner
      scope: same_position
    timeout:
      duration: 168h
    next: hired
    rejected_next: rejected
  - id: hired
    type: end
    name: 已录用
    status: completed
  - id: rejected
    type: end
    name: 未录用
    status: rejected
$YAML$,
    '{
      "code": "workstudy_apply_v1",
      "name": "勤工助学岗位申请",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"学生提交申请","next":"position_owner_review"},
        {"id":"position_owner_review","type":"approval","name":"岗位负责人审核","assignee":{"role":"position_owner","scope":"same_position"},"timeout":{"duration":"168h"},"next":"hired","rejected_next":"rejected"},
        {"id":"hired","type":"end","name":"已录用","status":"completed"},
        {"id":"rejected","type":"end","name":"未录用","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy',
    'workstudy_application'
)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 4. 1007: workstudy_salary_v1 — 用工申报 → 资助中心审批
-- ==========================================================================
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module, biz_type)
VALUES (
    1007,
    '${tenant_id}',
    'workstudy_salary_v1',
    '勤工助学薪资审批',
    1,
$YAML$
code: workstudy_salary_v1
name: 勤工助学薪资审批
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 用工单位申报
    next: aid_center_review
  - id: aid_center_review
    type: approval
    name: 资助中心审批
    assignee:
      role: aid_center_officer
      scope: global
    timeout:
      duration: 120h
    next: confirmed
    rejected_next: rejected
  - id: confirmed
    type: end
    name: 已确认（待支付）
    status: completed
  - id: rejected
    type: end
    name: 已驳回
    status: rejected
$YAML$,
    '{
      "code": "workstudy_salary_v1",
      "name": "勤工助学薪资审批",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"用工单位申报","next":"aid_center_review"},
        {"id":"aid_center_review","type":"approval","name":"资助中心审批","assignee":{"role":"aid_center_officer","scope":"global"},"timeout":{"duration":"120h"},"next":"confirmed","rejected_next":"rejected"},
        {"id":"confirmed","type":"end","name":"已确认（待支付）","status":"completed"},
        {"id":"rejected","type":"end","name":"已驳回","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy',
    'workstudy_salary'
)
ON CONFLICT (id) DO NOTHING;
