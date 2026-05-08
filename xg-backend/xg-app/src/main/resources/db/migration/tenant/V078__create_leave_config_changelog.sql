-- 请销假配置管理 P0：建立 leave_config_changelog 表。
-- 对应设计文档 v0.5 §1.6（变更日志表 · v0.5 修订：仅记状态变迁）。
--
-- 关键约定（设计 §1.6）：
--   - 仅记录"对学生申请实际生效"的变迁：publish / enable / disable / delete。
--   - draft 保存不入此表（由 leave_config_base 与 leave_config_patch 自身的
--     version + updated_at 兜底）。
--   - target='base' → diff_after 存整份 leave_config_base.config JSONB。
--   - target=<patch_id> → diff_after 存 patch 的 5 个可变字段
--     ({diff, scope, name, enabled, note})——为"放弃修改"恢复路径而存。

CREATE TABLE IF NOT EXISTS leave_config_changelog (
    log_id          BIGSERIAL    PRIMARY KEY,
    tenant_id       VARCHAR(32)  NOT NULL,
    target          VARCHAR(64)  NOT NULL,            -- 'base' | patch_id (UUID 字符串)
    action          VARCHAR(16)  NOT NULL,            -- 'publish' | 'enable' | 'disable' | 'delete'
    diff_before     JSONB,                            -- 变迁前快照；target='base' 是整份 config，patch 是 5 字段
    diff_after      JSONB,                            -- 变迁后快照；放弃修改恢复路径读这里
    changed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    changed_by      VARCHAR(64)  NOT NULL,
    changed_by_name VARCHAR(128) NOT NULL,
    note            TEXT         NOT NULL
);

-- 列表页时间倒序
CREATE INDEX IF NOT EXISTS idx_changelog_tenant_time
    ON leave_config_changelog(tenant_id, changed_at DESC);

-- 单 patch 历史 / "放弃修改"恢复路径用：
-- WHERE target = patch_id AND action = 'publish' ORDER BY changed_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_changelog_target
    ON leave_config_changelog(target);

COMMENT ON TABLE leave_config_changelog IS '请销假配置变更日志（v0.5 引入；仅记 publish/enable/disable/delete 等对学生申请实际生效的变迁）';
COMMENT ON COLUMN leave_config_changelog.target IS '''base'' 或 patch_id（UUID 字符串）';
COMMENT ON COLUMN leave_config_changelog.diff_after IS 'target=base: 整份 leave_config_base.config | target=patch_id: {diff,scope,name,enabled,note}（用于放弃修改恢复）';
