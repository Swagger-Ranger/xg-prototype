-- 请销假配置管理 P0：建立 leave_config_base 并把现有 leave_type_config 数据迁移过去。
-- 对应设计文档 v0.5 §7.0-B（critic 评审 C3 决议方案 A）。
--
-- 之所以现在就要切：旧表 leave_type_config 是 LeaveService.findEnabledLeaveType /
-- buildLeaveFormSchema 的唯一数据源。如果新表 leave_config_base 启用后旧表
-- 还在被读，就会出现"老师在新页面改的字段，学生申请校验时读不到"——
-- 双数据源永远是 bug 之源。所以本迁移做两步：建表 + 一次性把数据搬过来，
-- 紧跟着 V077（如果需要）迁移 Java 引用方（实际改造在 Java 代码层完成）。
--
-- 旧表 leave_type_config **不在本迁移中 DROP**——保留 ≥ 2 周观察期，
-- 全量切换稳定后用独立的 V0YY 弃表。

-- ============================================================================
-- 1) 建表
-- ============================================================================
-- 按 §1.6：(tenant_id, status) 双行 PK，draft 与 published 共存；
-- patch 表与 changelog 表留待 §7.1 主体实施时建立。
CREATE TABLE IF NOT EXISTS leave_config_base (
    tenant_id              VARCHAR(32) NOT NULL,
    status                 VARCHAR(16) NOT NULL,                    -- 'draft' | 'published'
    version                INT NOT NULL DEFAULT 1,                  -- 乐观锁
    config                 JSONB NOT NULL,                          -- { leaveTypes: [...], notifications: [...] }
    published_version      INT,                                     -- 仅 status='published' 行有值
    published_at           TIMESTAMPTZ,
    last_modified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified_by       VARCHAR(64) NOT NULL,
    last_modified_by_name  VARCHAR(128) NOT NULL,
    last_modified_note     TEXT NOT NULL,
    PRIMARY KEY (tenant_id, status)
);

CREATE INDEX IF NOT EXISTS idx_leave_config_base_tenant ON leave_config_base(tenant_id);

COMMENT ON TABLE leave_config_base IS '请销假配置基线（v0.5 引入；按 (tenant_id, status) 双行支持 draft+published 共存）';

-- ============================================================================
-- 2) 数据迁移：leave_type_config 5 行 → leave_config_base.config.leaveTypes
-- ============================================================================
-- 现有 extra_fields 是数组（顺序由数组下标隐式表达）；新 schema 是 map（§1.1）。
-- 由于 PostgreSQL JSONB 不保证 key 顺序，每个字段必须显式带 sortOrder 字段
-- 才能在 form 渲染时还原原始顺序。下面用 jsonb_array_elements ... WITH ORDINALITY
-- 把数组下标变成 sortOrder。
--
-- proof.required: V010 的 require_attachment 是 boolean，新模型是 'none'/'optional'/'required' 三态。
--   require_attachment=true  → 'required'
--   require_attachment=false → 'optional'（保留可选上传）
--   设计文档没有"绝对禁止上传"语义，故无 'none' 映射。
-- proof.fileTypes / maxSizeMB: V010 没有，写默认值 ["pdf","image"] / 10。
-- approvalChain: V010 没有，写最小默认值——3 天内辅导员；超过走 dean+学工干事——
--   §7.1 PatchMerger 上线后老师可以在配置页修改，此默认值仅是迁移引导。
-- notifications: 暂为空数组——P0 §1.1.1 引入了规则但 §6.4 决议 P0 不做 patch；
--   首次启动后由独立 seed 或老师配置补充。

WITH legacy AS (
    SELECT tenant_id, code, name, parent_code, sort_order, enabled,
           max_days, require_attachment, extra_fields
      FROM leave_type_config
     WHERE deleted_at IS NULL
),
with_extra_map AS (
    SELECT l.*,
           (
               SELECT COALESCE(
                   jsonb_object_agg(
                       arr.f->>'field_key',
                       jsonb_strip_nulls(
                           jsonb_build_object(
                               'type',          arr.f->>'field_type',
                               'label',         arr.f->>'field_label',
                               'required',      COALESCE((arr.f->>'required')::boolean, false),
                               'sortOrder',     arr.ord,
                               'options',       arr.f->'options',
                               'widget',        arr.f->>'field_widget',
                               'placeholder',   arr.f->>'placeholder',
                               'pattern',       arr.f->>'pattern',
                               'min',           arr.f->'min',
                               'max',           arr.f->'max',
                               'minLength',     arr.f->'min_length',
                               'maxLength',     arr.f->'max_length',
                               'fileMaxCount',  arr.f->'file_max_count',
                               'fileAccept',    arr.f->>'file_accept',
                               'fileMaxSizeKb', arr.f->'file_max_size_kb'
                           )
                       )
                   ),
                   '{}'::jsonb
               )
                 FROM jsonb_array_elements(l.extra_fields) WITH ORDINALITY AS arr(f, ord)
           ) AS extra_fields_map
      FROM legacy l
)
INSERT INTO leave_config_base (
    tenant_id, status, version, config,
    last_modified_at, last_modified_by, last_modified_by_name, last_modified_note
)
SELECT
    tenant_id,
    'published',
    1,
    jsonb_build_object(
        'leaveTypes',
        jsonb_agg(
            jsonb_strip_nulls(
                jsonb_build_object(
                    'code',          code,
                    'name',          name,
                    'parentCode',    parent_code,
                    'sortOrder',     sort_order,
                    'enabled',       enabled,
                    'maxDays',       max_days,
                    'proof', jsonb_build_object(
                        'required',  CASE WHEN require_attachment THEN 'required' ELSE 'optional' END,
                        'fileTypes', jsonb_build_array('pdf', 'image'),
                        'maxSizeMB', 10
                    ),
                    'approvalChain', jsonb_build_array(
                        jsonb_build_object('maxDays', 3,                              'roles', jsonb_build_array('counselor')),
                        jsonb_build_object('maxDays', COALESCE(max_days, 30),         'roles', jsonb_build_array('counselor', 'dean', 'student_affairs_officer'))
                    ),
                    'extraFields',   COALESCE(extra_fields_map, '{}'::jsonb)
                )
            )
            ORDER BY sort_order
        ),
        'notifications', '[]'::jsonb
    ),
    NOW(),
    'system',
    '系统迁移',
    'V076 一次性数据迁移：从 leave_type_config 转换为 leave_config_base'
  FROM with_extra_map
 GROUP BY tenant_id
ON CONFLICT (tenant_id, status) DO NOTHING;
