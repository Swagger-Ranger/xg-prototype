-- Data import wizard session: each upload from the 数据初始化 wizard creates a
-- row, and the row evolves through 5 wizard steps. Raw parsed grid is stored in
-- parsed_payload JSONB so we never re-parse the file mid-wizard; the original
-- file is not retained beyond parse (re-upload is cheap and audit lives in
-- result_summary).
--
-- Status transitions:
--   created → parsed → mapped → org_previewed (student only)
--          → validated → executing → executed | failed

CREATE TABLE IF NOT EXISTS data_import_session (
    id                  BIGINT PRIMARY KEY,
    tenant_id           VARCHAR(32) NOT NULL,
    importer_id         BIGINT NOT NULL,                 -- sys_user.id who uploaded
    scenario            VARCHAR(16) NOT NULL,            -- student / teacher / counselor
    status              VARCHAR(24) NOT NULL DEFAULT 'created',

    file_name           TEXT,
    total_rows          INT NOT NULL DEFAULT 0,

    -- Step 1 NL intent ("学号冲突时更新手机号，其他保留")
    intent_text         TEXT,

    -- { headers: ["学号", "姓名", ...], samples: [[...], [...]], rows: [[...], ...] }
    -- rows hold the entire parsed grid; cap at 5000 rows in service layer.
    parsed_payload      JSONB,

    -- { mappings: [{ source_col: "学号", target: "student_no", confidence: 0.95, source: "ai" | "user" }, ...] }
    column_mapping      JSONB,

    -- Step 2 NL 补充 ("备注里含'困难'两字的 aid_level 填 difficult")
    mapping_intent      TEXT,

    -- Student scenario only. { existing: [{name,type,id}], to_create: [{name,type,parent_path:[...]}] }
    org_preview         JSONB,

    -- { pass: N, warn: N, error: N, errors: [{row, col, message}], warnings: [...] }
    validation_report   JSONB,

    -- { on_conflict: 'skip' | 'update' | 'overwrite', update_columns: ["phone"] }
    strategy            JSONB,

    -- { created: N, updated: N, failed: N, failure_csv_b64: "..." }
    result_summary      JSONB,

    error_message       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_data_import_session_tenant
    ON data_import_session (tenant_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_data_import_session_importer
    ON data_import_session (importer_id, created_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE data_import_session  IS '数据导入向导会话，每次上传一条，状态随 5 步推进';
COMMENT ON COLUMN data_import_session.scenario       IS '场景：student / teacher / counselor';
COMMENT ON COLUMN data_import_session.status         IS '状态机：created → parsed → mapped → org_previewed → validated → executing → executed | failed';
COMMENT ON COLUMN data_import_session.intent_text    IS '用户在 Step 1 用一句话描述的导入意图';
COMMENT ON COLUMN data_import_session.parsed_payload IS '解析后的整张表（headers + samples + rows）';
COMMENT ON COLUMN data_import_session.column_mapping IS 'AI 建议 + 用户调整后的列映射';
COMMENT ON COLUMN data_import_session.org_preview    IS '学生场景的推断组织树预览';
