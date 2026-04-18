-- Notification record (from notification center)
CREATE TABLE IF NOT EXISTS notification (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    level           VARCHAR(16) NOT NULL DEFAULT 'normal',  -- normal / important / urgent
    source_type     VARCHAR(32) NOT NULL,        -- workflow / system / notification_task
    source_id       BIGINT,
    channels        TEXT[] NOT NULL,              -- {in_app, miniprogram, wecom}
    require_confirm BOOLEAN NOT NULL DEFAULT FALSE,
    sender_id       BIGINT,                      -- NULL for system-generated
    created_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
    -- No soft delete: notifications are persistent records
);

CREATE INDEX idx_notification_tenant ON notification(tenant_id);
CREATE INDEX idx_notification_source ON notification(source_type, source_id);
CREATE INDEX idx_notification_created ON notification(created_at DESC);

-- Notification recipient (one per user per channel)
CREATE TABLE IF NOT EXISTS notification_recipient (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    notification_id BIGINT NOT NULL REFERENCES notification(id),
    user_id         BIGINT NOT NULL,
    channel         VARCHAR(16) NOT NULL,         -- in_app / miniprogram / wecom
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / sent / failed
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    retry_count     INT NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_recip_user ON notification_recipient(user_id, channel);
CREATE INDEX idx_notif_recip_notif ON notification_recipient(notification_id);
CREATE INDEX idx_notif_recip_status ON notification_recipient(status) WHERE status = 'pending';
CREATE INDEX idx_notif_recip_unread ON notification_recipient(user_id)
    WHERE channel = 'in_app' AND read_at IS NULL;

COMMENT ON TABLE notification IS '通知记录（通知中心底层）';
COMMENT ON TABLE notification_recipient IS '通知接收人记录（每人每渠道一条）';
