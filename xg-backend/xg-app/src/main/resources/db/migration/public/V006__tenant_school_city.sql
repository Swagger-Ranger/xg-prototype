-- School location config — feeds the campus dashboard's weather widget and
-- any future "based on where the school is" feature. Stored on the tenant
-- row (one school per tenant) rather than a separate tenant_setting table:
-- it's a single value, rarely changes, and cleanly maps onto the existing
-- Tenant entity.
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS school_city VARCHAR(50);

COMMENT ON COLUMN tenant.school_city IS '学校所在城市（中文名，与 WeatherClient 白名单 key 对齐）';

-- Demo tenant default — picks an arbitrary whitelisted city so the dashboard
-- immediately renders weather without requiring a manual config step.
UPDATE tenant SET school_city = '杭州' WHERE id = 'default';
