-- 商用前补丁 #2：节假日日历表，给 leaveType.excludeHolidays 提供参考。
-- 设计：
--   * type='public_holiday' = 法定节假日；leaveType.excludeHolidays=true 时这些日期不计入请假天数
--   * type='compensatory_workday' = 调休工作日（周六/周日上班）；即便落在周末也按工作日算
--   * 周一到周五默认按工作日处理；周六/周日默认不计；以上由 LeaveCalendarService 统一计算
-- P0 节假日由 admin 用 SQL 维护，UI 留到 P1。

CREATE TABLE IF NOT EXISTS holiday_calendar (
    tenant_id  VARCHAR(32) NOT NULL,
    date       DATE        NOT NULL,
    name       TEXT        NOT NULL,
    type       VARCHAR(32) NOT NULL,  -- 'public_holiday' | 'compensatory_workday'
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holiday_calendar_tenant ON holiday_calendar(tenant_id);

COMMENT ON TABLE holiday_calendar IS '节假日 / 调休日历（leaveType.excludeHolidays 参考表）';

-- 2026 年常见节假日 seed（可由学工部按校历调整）。
INSERT INTO holiday_calendar (tenant_id, date, name, type) VALUES
    ('${tenant_id}', '2026-01-01', '元旦',    'public_holiday'),
    ('${tenant_id}', '2026-02-16', '春节(初一)', 'public_holiday'),
    ('${tenant_id}', '2026-02-17', '春节(初二)', 'public_holiday'),
    ('${tenant_id}', '2026-02-18', '春节(初三)', 'public_holiday'),
    ('${tenant_id}', '2026-02-19', '春节(初四)', 'public_holiday'),
    ('${tenant_id}', '2026-02-20', '春节(初五)', 'public_holiday'),
    ('${tenant_id}', '2026-04-04', '清明节',   'public_holiday'),
    ('${tenant_id}', '2026-04-06', '清明节调休', 'public_holiday'),
    ('${tenant_id}', '2026-05-01', '劳动节',   'public_holiday'),
    ('${tenant_id}', '2026-05-04', '劳动节调休', 'public_holiday'),
    ('${tenant_id}', '2026-05-05', '劳动节调休', 'public_holiday'),
    ('${tenant_id}', '2026-06-19', '端午节',   'public_holiday'),
    ('${tenant_id}', '2026-09-25', '中秋节',   'public_holiday'),
    ('${tenant_id}', '2026-10-01', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-02', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-03', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-04', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-05', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-06', '国庆节',   'public_holiday'),
    ('${tenant_id}', '2026-10-07', '国庆节',   'public_holiday')
ON CONFLICT (tenant_id, date) DO NOTHING;
