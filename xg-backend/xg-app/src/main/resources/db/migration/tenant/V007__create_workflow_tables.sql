-- Workflow definition
CREATE TABLE IF NOT EXISTS workflow_definition (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    version         INT NOT NULL DEFAULT 1,
    config_yaml     TEXT NOT NULL,
    config_json     JSONB NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'draft',  -- draft / published / disabled
    module          VARCHAR(32) NOT NULL,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(tenant_id, code, version)
);

CREATE INDEX idx_wf_def_tenant_module ON workflow_definition(tenant_id, module);
CREATE INDEX idx_wf_def_status ON workflow_definition(status);

-- Workflow instance
CREATE TABLE IF NOT EXISTS workflow_instance (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    definition_id   BIGINT NOT NULL REFERENCES workflow_definition(id),
    definition_snapshot JSONB NOT NULL,
    initiator_id    BIGINT NOT NULL,
    current_node_id VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'running',  -- running / completed / rejected / cancelled
    context         JSONB NOT NULL DEFAULT '{}',
    biz_type        VARCHAR(32) NOT NULL,
    biz_id          BIGINT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_wf_inst_tenant ON workflow_instance(tenant_id);
CREATE INDEX idx_wf_inst_initiator ON workflow_instance(initiator_id);
CREATE INDEX idx_wf_inst_status ON workflow_instance(status);
CREATE INDEX idx_wf_inst_biz ON workflow_instance(biz_type, biz_id);

-- Task instance (approval tasks)
CREATE TABLE IF NOT EXISTS task_instance (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instance(id),
    node_id         VARCHAR(64) NOT NULL,
    node_name       VARCHAR(100) NOT NULL,
    assignee_id     BIGINT NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / approved / rejected / skipped
    comment         TEXT,
    due_at          TIMESTAMPTZ,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    decision_duration_ms BIGINT,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_task_assignee ON task_instance(assignee_id, status);
CREATE INDEX idx_task_workflow ON task_instance(workflow_instance_id);
CREATE INDEX idx_task_pending ON task_instance(status, due_at) WHERE status = 'pending';

-- Form data (dynamic form storage)
CREATE TABLE IF NOT EXISTS form_data (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instance(id),
    data            JSONB NOT NULL DEFAULT '{}',
    ai_draft        JSONB,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Generated column for high-frequency query on student_id
ALTER TABLE form_data
    ADD COLUMN IF NOT EXISTS student_id VARCHAR(20) GENERATED ALWAYS AS (data->>'student_id') STORED;
CREATE INDEX IF NOT EXISTS idx_form_data_student ON form_data(student_id) WHERE student_id IS NOT NULL;

CREATE INDEX idx_form_data_workflow ON form_data(workflow_instance_id);

COMMENT ON TABLE workflow_definition IS '工作流定义';
COMMENT ON TABLE workflow_instance IS '工作流实例';
COMMENT ON TABLE task_instance IS '审批任务实例';
COMMENT ON TABLE form_data IS '动态表单数据';
