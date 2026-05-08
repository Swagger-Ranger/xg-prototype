-- Work-study workflow wiring (Step 2): schema extensions + 3 workflow definitions
-- ${tenant_id} is substituted at runtime by TenantMigrationRunner.

-- ==========================================================================
-- 1. Extend existing tables with workflow_instance_id
-- ==========================================================================
ALTER TABLE work_study_position
    ADD COLUMN IF NOT EXISTS workflow_instance_id BIGINT;

ALTER TABLE work_study_application
    ADD COLUMN IF NOT EXISTS workflow_instance_id BIGINT;

-- ==========================================================================
-- 2. New tables: timesheet + salary
-- ==========================================================================
CREATE TABLE IF NOT EXISTS work_study_timesheet (
    id                     BIGINT PRIMARY KEY,
    tenant_id              VARCHAR(32) NOT NULL,
    workflow_instance_id   BIGINT,
    application_id         BIGINT NOT NULL,
    student_id             BIGINT NOT NULL,
    position_id            BIGINT NOT NULL,
    month                  VARCHAR(7) NOT NULL,               -- e.g. '2026-04'
    hours_reported         NUMERIC(5,1) NOT NULL,
    hours_confirmed        NUMERIC(5,1),
    hours_final            NUMERIC(5,1),
    student_confirmed_at   TIMESTAMPTZ,
    dispute_note           TEXT,
    finalize_note          TEXT,
    status                 VARCHAR(16) NOT NULL DEFAULT 'pending_confirm',  -- pending_confirm / confirmed / disputed / finalized
    reporter_id            BIGINT NOT NULL,
    created_by             BIGINT,
    updated_by             BIGINT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ws_timesheet_tenant  ON work_study_timesheet(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ws_timesheet_student ON work_study_timesheet(student_id, month);
CREATE INDEX IF NOT EXISTS idx_ws_timesheet_status  ON work_study_timesheet(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_timesheet_app_month
    ON work_study_timesheet(application_id, month)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE work_study_timesheet IS '勤工助学月度工时（走 workstudy_timesheet_v1 工作流）';

CREATE TABLE IF NOT EXISTS work_study_salary (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    timesheet_id        BIGINT NOT NULL,
    student_id          BIGINT NOT NULL,
    position_id         BIGINT NOT NULL,
    month               VARCHAR(7) NOT NULL,
    hours               NUMERIC(5,1) NOT NULL,
    hourly_rate         NUMERIC(6,2) NOT NULL,
    amount              NUMERIC(8,2) NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'draft',  -- draft / confirmed / paid
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    created_by          BIGINT,
    updated_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ws_salary_tenant   ON work_study_salary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ws_salary_student  ON work_study_salary(student_id, month);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_salary_timesheet ON work_study_salary(timesheet_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE work_study_salary IS '勤工助学工资结算（Step 7 定时生成）';

-- ==========================================================================
-- 3. Seed workflow definitions
--    1002: workstudy_position_v1 — 岗位申报审批
--    1003: workstudy_apply_v1    — 学生申请录用
--    1004: workstudy_timesheet_v1— 工时确认
-- ==========================================================================

-- ---- 1002: workstudy_position_v1 ----
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module)
VALUES (
    1002,
    '${tenant_id}',
    'workstudy_position_v1',
    '勤工助学岗位审批',
    1,
$YAML$
code: workstudy_position_v1
name: 勤工助学岗位审批
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 用工部门申报
    next: officer_approval
  - id: officer_approval
    type: approval
    name: 学工部审批
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
      "name": "勤工助学岗位审批",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"用工部门申报","next":"officer_approval"},
        {"id":"officer_approval","type":"approval","name":"学工部审批","assignee":{"role":"student_affairs_officer","scope":"global"},"timeout":{"duration":"72h"},"next":"opened","rejected_next":"rejected"},
        {"id":"opened","type":"end","name":"岗位开放","status":"completed"},
        {"id":"rejected","type":"end","name":"已驳回","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy'
)
ON CONFLICT (id) DO NOTHING;

-- ---- 1003: workstudy_apply_v1 ----
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module)
VALUES (
    1003,
    '${tenant_id}',
    'workstudy_apply_v1',
    '勤工助学申请录用',
    1,
$YAML$
code: workstudy_apply_v1
name: 勤工助学申请录用
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 学生提交申请
    next: counselor_recommend
  - id: counselor_recommend
    type: approval
    name: 辅导员推荐
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 72h
    next: officer_hire
    rejected_next: rejected
  - id: officer_hire
    type: approval
    name: 学工部录用审批
    assignee:
      role: student_affairs_officer
      scope: global
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
    name: 未录用
    status: rejected
$YAML$,
    '{
      "code": "workstudy_apply_v1",
      "name": "勤工助学申请录用",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"学生提交申请","next":"counselor_recommend"},
        {"id":"counselor_recommend","type":"approval","name":"辅导员推荐","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"72h"},"next":"officer_hire","rejected_next":"rejected"},
        {"id":"officer_hire","type":"approval","name":"学工部录用审批","assignee":{"role":"student_affairs_officer","scope":"global"},"timeout":{"duration":"72h"},"next":"hired","rejected_next":"rejected"},
        {"id":"hired","type":"end","name":"已录用","status":"completed"},
        {"id":"rejected","type":"end","name":"未录用","status":"rejected"}
      ]
    }'::jsonb,
    'published',
    'workstudy'
)
ON CONFLICT (id) DO NOTHING;

-- ---- 1004: workstudy_timesheet_v1 ----
-- initiator 约定：workflow 的 initiator_id 传 student_id（即使 API 由用工部门调用），
-- 这样 student+self 分支直接返回 [initiatorId]。
INSERT INTO workflow_definition (id, tenant_id, code, name, version, config_yaml, config_json, status, module)
VALUES (
    1004,
    '${tenant_id}',
    'workstudy_timesheet_v1',
    '勤工助学工时确认',
    1,
$YAML$
code: workstudy_timesheet_v1
name: 勤工助学工时确认
module: workstudy
start: start
nodes:
  - id: start
    type: form_submit
    name: 用工部门上报
    next: student_confirm
  - id: student_confirm
    type: approval
    name: 学生确认工时
    assignee:
      role: student
      scope: self
    timeout:
      duration: 72h
    next: confirmed
    rejected_next: officer_finalize
  - id: officer_finalize
    type: approval
    name: 学工部裁定异议
    assignee:
      role: student_affairs_officer
      scope: global
    timeout:
      duration: 72h
    next: finalized
    rejected_next: finalized
  - id: confirmed
    type: end
    name: 已确认
    status: completed
  - id: finalized
    type: end
    name: 已裁定
    status: completed
$YAML$,
    '{
      "code": "workstudy_timesheet_v1",
      "name": "勤工助学工时确认",
      "module": "workstudy",
      "start": "start",
      "nodes": [
        {"id":"start","type":"form_submit","name":"用工部门上报","next":"student_confirm"},
        {"id":"student_confirm","type":"approval","name":"学生确认工时","assignee":{"role":"student","scope":"self"},"timeout":{"duration":"72h"},"next":"confirmed","rejected_next":"officer_finalize"},
        {"id":"officer_finalize","type":"approval","name":"学工部裁定异议","assignee":{"role":"student_affairs_officer","scope":"global"},"timeout":{"duration":"72h"},"next":"finalized","rejected_next":"finalized"},
        {"id":"confirmed","type":"end","name":"已确认","status":"completed"},
        {"id":"finalized","type":"end","name":"已裁定","status":"completed"}
      ]
    }'::jsonb,
    'published',
    'workstudy'
)
ON CONFLICT (id) DO NOTHING;
