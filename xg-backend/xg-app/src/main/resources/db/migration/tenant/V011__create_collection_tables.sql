-- Collection form definition
CREATE TABLE IF NOT EXISTS collection_form (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    fields          JSONB NOT NULL DEFAULT '[]',
    creator_id      BIGINT NOT NULL,
    scope_type      VARCHAR(16) NOT NULL DEFAULT 'class',  -- class / college / school
    scope_org_ids   BIGINT[],
    status          VARCHAR(16) NOT NULL DEFAULT 'draft',  -- draft / published / closed
    deadline        TIMESTAMPTZ,
    allow_edit      BOOLEAN NOT NULL DEFAULT TRUE,
    task_id         BIGINT,
    source_form_id  BIGINT,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_collection_form_tenant ON collection_form(tenant_id);
CREATE INDEX idx_collection_form_creator ON collection_form(creator_id);
CREATE INDEX idx_collection_form_task ON collection_form(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_collection_form_status ON collection_form(status);

-- Collection task (school-level)
CREATE TABLE IF NOT EXISTS collection_task (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    fields          JSONB NOT NULL DEFAULT '[]',
    creator_id      BIGINT NOT NULL,
    scope_org_ids   BIGINT[],
    deadline        TIMESTAMPTZ,
    status          VARCHAR(16) NOT NULL DEFAULT 'draft',  -- draft / published / closed
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_collection_task_tenant ON collection_task(tenant_id);

-- Collection submission (student fill)
CREATE TABLE IF NOT EXISTS collection_submission (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    form_id         BIGINT NOT NULL REFERENCES collection_form(id),
    student_id      BIGINT NOT NULL,
    data            JSONB NOT NULL DEFAULT '{}',
    status          VARCHAR(16) NOT NULL DEFAULT 'submitted',  -- submitted / edited
    submitted_at    TIMESTAMPTZ DEFAULT NOW(),
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_submission_form ON collection_submission(form_id);
CREATE INDEX idx_submission_student ON collection_submission(student_id);
CREATE UNIQUE INDEX idx_submission_unique ON collection_submission(form_id, student_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE collection_form IS '信息收集单定义';
COMMENT ON TABLE collection_task IS '校级信息收集任务';
COMMENT ON TABLE collection_submission IS '学生填报记录';
