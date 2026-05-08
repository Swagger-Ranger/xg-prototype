-- Capture geolocation at apply / 销假 time. Lat range -90..90, lng -180..180,
-- 7 decimals ≈ 11mm precision (overkill for browser WiFi geolocation, plenty
-- for our use). All columns nullable — students may decline the permission.

ALTER TABLE leave_request
    ADD COLUMN apply_latitude    DECIMAL(10, 7),
    ADD COLUMN apply_longitude   DECIMAL(10, 7),
    ADD COLUMN apply_location_at TIMESTAMPTZ,
    ADD COLUMN return_latitude    DECIMAL(10, 7),
    ADD COLUMN return_longitude   DECIMAL(10, 7),
    ADD COLUMN return_location_at TIMESTAMPTZ;

COMMENT ON COLUMN leave_request.apply_latitude IS '申请请假时浏览器定位（拒绝授权则 NULL）';
COMMENT ON COLUMN leave_request.apply_location_at IS '定位捕获时间，可能与提交时间略有偏差';
COMMENT ON COLUMN leave_request.return_latitude IS '销假时浏览器定位（拒绝授权则 NULL）';
