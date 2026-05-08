-- Extension channel for student_profile: a JSONB bag + metadata table.
-- Admins add/edit fields in field_definition at runtime; values land in
-- student_profile.extended_info without DDL. High-frequency fields can later
-- be promoted to generated columns or real columns.

ALTER TABLE student_profile
    ADD COLUMN IF NOT EXISTS extended_info JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN student_profile.extended_info IS '扩展信息，由 field_definition 元数据描述字段';

CREATE TABLE IF NOT EXISTS field_definition (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     VARCHAR(64),
    code          VARCHAR(64)  NOT NULL,
    label         VARCHAR(100) NOT NULL,
    field_type    VARCHAR(20)  NOT NULL,
    options       JSONB,
    placeholder   VARCHAR(200),
    required      BOOLEAN      NOT NULL DEFAULT false,
    sort_order    INT          NOT NULL DEFAULT 0,
    enabled       BOOLEAN      NOT NULL DEFAULT true,
    created_by    BIGINT,
    updated_by    BIGINT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT uq_field_definition_code UNIQUE (code)
);

COMMENT ON TABLE field_definition IS '学生画像扩展字段元数据';
COMMENT ON COLUMN field_definition.field_type IS 'text / number / date / select / textarea';
COMMENT ON COLUMN field_definition.options IS 'select 类型的可选项数组 ["A","B","AB","O"]';

CREATE INDEX IF NOT EXISTS idx_field_definition_enabled_sort
    ON field_definition(enabled, sort_order) WHERE deleted_at IS NULL;

-- Seed three sample fields so the UI has something to render out of the box.
INSERT INTO field_definition (tenant_id, code, label, field_type, options, placeholder, required, sort_order, enabled)
VALUES
    ('${tenant_id}', 'hobby',             '兴趣爱好', 'text',     NULL,                                        '如：篮球、编程', false, 10, true),
    ('${tenant_id}', 'blood_type',        '血型',     'select',   '["A","B","AB","O","未知"]'::jsonb,          NULL,             false, 20, true),
    ('${tenant_id}', 'dormitory',         '宿舍号',   'text',     NULL,                                        '楼栋-房间，如 6-305', false, 30, true)
ON CONFLICT (code) DO NOTHING;

-- Populate a few demo students so radar/charts have real content to show.
UPDATE student_profile SET extended_info = extended_info || '{"hobby":"篮球、编程","blood_type":"A","dormitory":"6-305"}'::jsonb WHERE student_no = '2023001001';
UPDATE student_profile SET extended_info = extended_info || '{"hobby":"阅读","blood_type":"B","dormitory":"4-210"}'::jsonb      WHERE student_no = '2023001002';
UPDATE student_profile SET extended_info = extended_info || '{"hobby":"绘画","blood_type":"O","dormitory":"4-211"}'::jsonb      WHERE student_no = '2023001003';
UPDATE student_profile SET extended_info = extended_info || '{"hobby":"音乐","blood_type":"AB","dormitory":"6-306"}'::jsonb     WHERE student_no = '2024001001';
