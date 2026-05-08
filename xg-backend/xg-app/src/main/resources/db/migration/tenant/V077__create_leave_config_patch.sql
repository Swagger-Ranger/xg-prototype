-- 请销假配置管理 P0：建立 leave_config_patch 表（OrgPatch + TimePatch 共存）。
-- 对应设计文档 v0.5 §1.6（Patch 表 · 单行可变 status 简化方案）。
--
-- 设计取舍：
--   - 一个逻辑 patch 一行；编辑期间把 status 翻成 draft（暂停参与学生申请合并），
--     发布后翻回 published。这避免了 v0.4 的 parent_patch_id 双行同步逻辑。
--   - patch_id 用 UUID 而不是 BIGSERIAL：跨租户/导入导出无主键冲突，且
--     LeaveConfigPatch POJO（§7.0-C）已使用 UUID。
--   - 无 deleted_at——放弃修改时直接 DELETE（设计 §1.6 表格明确）。

CREATE TABLE IF NOT EXISTS leave_config_patch (
    patch_id        UUID PRIMARY KEY,
    tenant_id       VARCHAR(32)  NOT NULL,
    type            VARCHAR(16)  NOT NULL,                  -- 'org' | 'time'
    name            VARCHAR(128),                           -- TimePatch 必填；OrgPatch 可空
    scope           JSONB        NOT NULL,
    diff            JSONB        NOT NULL,
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    status          VARCHAR(16)  NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
    version         INT          NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(64)  NOT NULL,
    created_by_name VARCHAR(128) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by      VARCHAR(64)  NOT NULL,
    updated_by_name VARCHAR(128) NOT NULL,
    note            TEXT         NOT NULL
);

-- 主热点查询：列表页 + 学生申请合并阶段筛 published+enabled 的某种 type
CREATE INDEX IF NOT EXISTS idx_patch_tenant_type
    ON leave_config_patch(tenant_id, type, status, enabled);

-- TimePatch 时间范围筛选：student.applyDate ∈ [scope.from, scope.to]
-- 使用部分索引避免 OrgPatch 行参与该索引
CREATE INDEX IF NOT EXISTS idx_patch_time_scope
    ON leave_config_patch ((scope->>'from'), (scope->>'to'))
    WHERE type = 'time' AND status = 'published';

-- OrgPatch 命中 student.orgId 的查询：scope.orgIds 是 JSONB 数组，用 GIN 索引
CREATE INDEX IF NOT EXISTS idx_patch_scope_orgs
    ON leave_config_patch USING GIN ((scope->'orgIds'))
    WHERE type = 'org' AND status = 'published';

COMMENT ON TABLE leave_config_patch IS '请销假配置 patch（v0.5 引入；type=org/time，单行可变 status，编辑期间暂停生效）';
COMMENT ON COLUMN leave_config_patch.scope IS 'OrgPatch: {orgIds:[],orgNamesSnapshot:[]} | TimePatch: {from,to,orgIds|null}';
COMMENT ON COLUMN leave_config_patch.diff IS '受限 op 数组：[{path,op:replace|enable|disable|elevate,value?}]';
COMMENT ON COLUMN leave_config_patch.status IS 'draft（编辑中，不参与学生申请合并）| published（生效）';
