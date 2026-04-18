CREATE TABLE IF NOT EXISTS file_metadata (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    original_name   TEXT NOT NULL,
    stored_name     TEXT NOT NULL,               -- UUID-based name in MinIO
    bucket          VARCHAR(64) NOT NULL,
    object_key      TEXT NOT NULL,                -- full path in MinIO
    content_type    VARCHAR(128),
    file_size       BIGINT NOT NULL,             -- bytes
    md5_hash        VARCHAR(32),
    uploader_id     BIGINT NOT NULL,
    biz_type        VARCHAR(32),                 -- leave, complaint, collection, etc.
    biz_id          BIGINT,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active, deleted
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_file_tenant ON file_metadata(tenant_id);
CREATE INDEX idx_file_biz ON file_metadata(biz_type, biz_id);
CREATE INDEX idx_file_uploader ON file_metadata(uploader_id);

COMMENT ON TABLE file_metadata IS '文件元数据（实际文件存储在 MinIO）';
